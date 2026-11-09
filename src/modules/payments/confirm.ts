import "server-only";
import { recordConversion } from "@/modules/analytics/events";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ServiceContext, SystemContext } from "@/server/context";
import { attempt, ensure, AppError } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { lockOrder } from "./locking";
import type {
  PaymentPort,
  VerifiedPayment,
} from "@/integrations/payments/port";
import {
  getPaymentProvider,
  paymentReadiness,
} from "@/integrations/payments/provider";
import { netAcademyBalances } from "./settlement-netting";

type SessionSnapshot = {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  amountWon: number;
};
const fact = z.object({
  transactionId: z.string().min(1).max(200),
  orderId: z.uuid(),
  amountWon: z.number().int().nonnegative().max(2147483647),
  currency: z.literal("KRW"),
  mode: z.literal("test"),
  status: z.enum([
    "pending",
    "paid",
    "failed",
    "cancelled",
    "partially_refunded",
    "refunded",
  ]),
  refundedAmountWon: z.number().int().nonnegative().optional(),
});

export async function postPaymentLedger(
  tx: Prisma.TransactionClient,
  order: { id: string; academyId: string; amountWon: number; feeWon: number },
  paymentId: string,
  now: Date,
) {
  for (const [kind, amount] of [
    ["payment", order.amountWon],
    ["fee", -order.feeWon],
    ["academy_due", order.amountWon - order.feeWon],
  ] as const)
    await tx.settlementEntry.upsert({
      where: { idempotencyKey: `payment:${paymentId}:${kind}` },
      create: {
        academyId: order.academyId,
        orderId: order.id,
        paymentId,
        kind,
        amountWon: amount,
        idempotencyKey: `payment:${paymentId}:${kind}`,
        createdAt: now,
      },
      update: {},
    });
  await netAcademyBalances(tx, order.academyId, now);
}

export function applyVerifiedPayment(
  sys: SystemContext,
  input: VerifiedPayment,
) {
  return attempt(async () => {
    const p = fact.parse(input),
      now = sys.now();
    await sys.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, p.orderId, now);
      ensure(
        p.amountWon === order.amountWon && p.currency === order.currency,
        "VALIDATION",
      );
      ensure(
        !order.payment || order.payment.transactionId === p.transactionId,
        "CONFLICT",
      );
      const used = await tx.payment.findUnique({
        where: { transactionId: p.transactionId },
      });
      ensure(!used || used.orderId === order.id, "CONFLICT");
      if (["pending", "failed"].includes(p.status)) {
        if (
          order.payment &&
          !["pending", "failed"].includes(order.payment.status)
        )
          return;
        if (order.status !== "pending_payment") return;
        await tx.payment.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            transactionId: p.transactionId,
            amountWon: p.amountWon,
            status: p.status,
            provider: "fake",
            verifiedAt: now,
          },
          update: { status: p.status, verifiedAt: now },
        });
        return;
      }
      const payment = await tx.payment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          transactionId: p.transactionId,
          amountWon: p.amountWon,
          status: p.status,
          provider: "fake",
          verifiedAt: now,
        },
        update: { verifiedAt: now },
      });
      await postPaymentLedger(tx, order, payment.id, now);
      if (p.status === "paid")
        await recordConversion(tx, {
          stage: "paid",
          academyId: order.academyId,
          offeringId: order.offeringId,
          orderId: order.id,
          dedupeKey: `paid:${order.id}`,
          now,
        });
      if (["refunded", "cancelled", "partially_refunded"].includes(p.status)) {
        const refunded = await tx.refund.aggregate({
          where: { orderId: order.id, status: "succeeded" },
          _sum: { amountWon: true },
        });
        const local = refunded._sum.amountWon || 0;
        const nextStatus = ["refunded", "cancelled"].includes(payment.status)
          ? payment.status
          : local >= order.amountWon
            ? "refunded"
            : p.status;
        if (
          (p.refundedAmountWon ??
            (p.status === "partially_refunded" ? 0 : p.amountWon)) > local
        ) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: "payment_exception",
              exceptionReason: "UNMATCHED_PROVIDER_REFUND",
            },
          });
          if (order.enrollment)
            await tx.enrollment.update({
              where: { id: order.enrollment.id },
              data: { status: "pending_payment" },
            });
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: nextStatus },
        });
        return;
      }
      // Paid notifications can be duplicated or arrive after a known refund.
      if (
        ["partially_refunded", "refunded", "cancelled"].includes(payment.status)
      )
        return;
      if (
        order.enrollment ||
        ["paid", "partially_refunded", "refunded"].includes(order.status)
      )
        return;
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "paid" },
      });
      const guardian = await tx.guardianLink.findUnique({
        where: {
          guardianId_studentId: {
            guardianId: order.parentId,
            studentId: order.studentId,
          },
        },
        include: { guardian: true },
      });
      const sessions = z
        .array(
          z.object({
            sessionId: z.uuid(),
            startsAt: z.iso.datetime(),
            endsAt: z.iso.datetime(),
            amountWon: z.number().int().nonnegative(),
          }),
        )
        .parse(order.sessionsSnapshot) as SessionSnapshot[];
      const prior = await tx.enrollment.findUnique({
        where: {
          offeringId_studentId: {
            offeringId: order.offeringId,
            studentId: order.studentId,
          },
        },
      });
      const invalid =
        order.status !== "pending_payment" ||
        !order.consentedAt ||
        !order.reservation ||
        order.reservation.status !== "held" ||
        order.reservation.expiresAt <= now ||
        order.expiresAt <= now ||
        order.offering.status !== "published" ||
        order.offering.academy.status !== "approved" ||
        !guardian ||
        !!guardian.revokedAt ||
        !!guardian.guardian.disabledAt ||
        !guardian.guardian.guardianVerifiedAt ||
        !!order.student.account?.disabledAt ||
        sessions.length === 0 ||
        sessions.some((s) => new Date(s.startsAt) <= now) ||
        !!prior;
      if (invalid) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "payment_exception",
            exceptionReason: "PAID_WITHOUT_VALID_RESERVATION",
          },
        });
        if (order.reservation)
          await tx.seatReservation.update({
            where: { orderId: order.id },
            data: { status: "released" },
          });
        const refund = await tx.refund.upsert({
          where: { requestKey: `compensation:${order.id}` },
          create: {
            orderId: order.id,
            paymentId: payment.id,
            requestKey: `compensation:${order.id}`,
            kind: "compensation",
            amountWon: order.amountWon,
            reason: "예약 또는 권한 만료 후 결제 확인",
            createdAt: now,
          },
          update: {},
        });
        await tx.job.upsert({
          where: { dedupeKey: `refund:${refund.id}` },
          create: {
            type: "refund",
            dedupeKey: `refund:${refund.id}`,
            payloadJson: { refundId: refund.id },
            runAt: now,
          },
          update: {},
        });
        return;
      }
      await tx.enrollment.create({
        data: {
          orderId: order.id,
          offeringId: order.offeringId,
          studentId: order.studentId,
          status: "active",
          sessions: {
            create: sessions.map((s) => ({
              ...s,
              startsAt: new Date(s.startsAt),
              endsAt: new Date(s.endsAt),
            })),
          },
        },
      });
      await tx.seatReservation.update({
        where: { orderId: order.id },
        data: { status: "consumed" },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "paid", exceptionReason: null },
      });
    });
  });
}

export function preparePayment(
  ctx: ServiceContext,
  input: { orderId: string; requestKey: string },
  port?: PaymentPort,
) {
  return attempt(async () => {
    await requireActor(ctx);
    z.uuid().parse(input.orderId);
    z.string().min(1).max(200).parse(input.requestKey);
    ensure(paymentReadiness().configured, "PROVIDER_UNAVAILABLE");
    const order = await ctx.db.$transaction(async (tx) => {
      const o = await lockOrder(tx, input.orderId, ctx.now());
      ensure(o.parentId === ctx.actor.userId, "NOT_FOUND");
      ensure(o.consentedAt, "VALIDATION");
      ensure(
        o.status === "pending_payment" &&
          o.expiresAt > ctx.now() &&
          o.reservation?.status === "held",
        "EXPIRED",
      );
      const guardian = await tx.guardianLink.findUnique({
        where: {
          guardianId_studentId: {
            guardianId: o.parentId,
            studentId: o.studentId,
          },
        },
        include: { guardian: true },
      });
      ensure(
        guardian &&
          !guardian.revokedAt &&
          guardian.guardian.guardianVerifiedAt &&
          !guardian.guardian.disabledAt &&
          o.offering.status === "published" &&
          o.offering.academy.status === "approved" &&
          !o.student.account?.disabledAt,
        "FORBIDDEN",
      );
      await tx.payment.upsert({
        where: { orderId: o.id },
        create: {
          orderId: o.id,
          transactionId: o.id,
          amountWon: o.amountWon,
          provider: "fake",
          status: "pending",
        },
        update: {},
      });
      return o;
    });
    try {
      return await (port || getPaymentProvider()).prepare({
        orderId: order.id,
        amountWon: order.amountWon,
        requestKey: `prepare:${order.id}`,
        orderName: "EDUON 수강 신청",
      });
    } catch {
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
  });
}

export function confirmPayment(
  ctx: ServiceContext,
  input: { orderId: string; transactionId: string },
  port?: PaymentPort,
) {
  return attempt(async () => {
    await requireActor(ctx);
    z.uuid().parse(input.orderId);
    z.string().min(1).max(200).parse(input.transactionId);
    ensure(paymentReadiness().configured, "PROVIDER_UNAVAILABLE");
    const order = await ctx.db.order.findFirst({
      where: { id: input.orderId, parentId: ctx.actor.userId },
      include: { payment: true },
    });
    ensure(order, "NOT_FOUND");
    ensure(order.payment?.transactionId === input.transactionId, "CONFLICT");
    let p: VerifiedPayment;
    try {
      p = await (port || getPaymentProvider()).fetchPayment(
        input.transactionId,
      );
    } catch {
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
    ensure(
      p.orderId === order.id && p.transactionId === input.transactionId,
      "CONFLICT",
    );
    const result = await applyVerifiedPayment(
      { db: ctx.db, now: ctx.now, source: "job" },
      p,
    );
    if (!result.ok) throw new AppError(result.code);
    return { orderId: order.id };
  });
}
