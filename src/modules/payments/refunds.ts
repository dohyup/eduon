import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ServiceContext, SystemContext } from "@/server/context";
import { attempt, ensure, AppError } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { lockOrder } from "./locking";
import type { PaymentPort, VerifiedRefund } from "@/integrations/payments/port";
import { netAcademyBalances } from "./settlement-netting";

const inputSchema = z
  .object({
    orderId: z.uuid(),
    cancelSessionIds: z.array(z.uuid()).min(1).max(100),
    reason: z.string().trim().min(1).max(500),
    requestKey: z.string().trim().min(1).max(200),
  })
  .strict();
export function requestRefund(
  ctx: ServiceContext,
  input: z.input<typeof inputSchema>,
) {
  return attempt(async () => {
    await requireActor(ctx);
    const data = inputSchema.parse(input),
      now = ctx.now();
    const ids = [...new Set(data.cancelSessionIds)].sort();
    ensure(ids.length === data.cancelSessionIds.length, "VALIDATION");
    const key =
      "refund:" +
      createHash("sha256")
        .update(`${ctx.actor.userId}:${data.requestKey}`)
        .digest("hex");
    return ctx.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, data.orderId, now);
      ensure(order.parentId === ctx.actor.userId, "NOT_FOUND");
      const old = await tx.refund.findUnique({
        where: { requestKey: key },
        include: { sessions: { include: { enrollmentSession: true } } },
      });
      if (old) {
        ensure(
          old.orderId === order.id &&
            old.reason === data.reason &&
            JSON.stringify(
              old.sessions.map((s) => s.enrollmentSession.sessionId).sort(),
            ) === JSON.stringify(ids),
          "CONFLICT",
        );
        return { refundId: old.id };
      }
      ensure(
        order.payment &&
          ["paid", "partially_refunded"].includes(order.payment.status) &&
          order.enrollment &&
          ["paid", "partially_refunded"].includes(order.status),
        "CONFLICT",
      );
      const rights = order.enrollment.sessions.filter((s) =>
        ids.includes(s.sessionId),
      );
      ensure(
        rights.length === ids.length &&
          rights.every(
            (s) => s.status === "allowed" && !s.completedAt && s.startsAt > now,
          ),
        "CONFLICT",
      );
      const amount = rights.reduce((n, s) => n + s.amountWon, 0);
      ensure(amount > 0, "VALIDATION");
      const committed = await tx.refund.aggregate({
        where: {
          orderId: order.id,
          status: { in: ["requested", "processing", "pending", "succeeded"] },
        },
        _sum: { amountWon: true },
      });
      ensure(
        (committed._sum.amountWon || 0) + amount <= order.amountWon,
        "CONFLICT",
      );
      const refund = await tx.refund.create({
        data: {
          orderId: order.id,
          paymentId: order.payment.id,
          requestKey: key,
          requestedById: ctx.actor.userId,
          amountWon: amount,
          reason: data.reason,
          createdAt: now,
          sessions: {
            create: rights.map((s) => ({ enrollmentSessionId: s.id })),
          },
        },
      });
      await tx.enrollmentSession.updateMany({
        where: { id: { in: rights.map((s) => s.id) } },
        data: { status: "refund_pending" },
      });
      await tx.job.create({
        data: {
          type: "refund",
          dedupeKey: `refund:${refund.id}`,
          payloadJson: { refundId: refund.id, orderId: order.id },
          runAt: now,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "refund.requested",
          targetId: refund.id,
          reason: data.reason,
          createdAt: now,
        },
      });
      return { refundId: refund.id };
    });
  });
}

export function processRefund(
  sys: SystemContext,
  refundId: string,
  port: PaymentPort,
) {
  return attempt(async () => {
    z.uuid().parse(refundId);
    const ref = await sys.db.refund.findUnique({
      where: { id: refundId },
      select: { orderId: true },
    });
    ensure(ref, "NOT_FOUND");
    const claim = await sys.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, ref.orderId, sys.now());
      const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
      if (r.status === "succeeded") return null;
      ensure(r.status !== "failed", "CONFLICT");
      ensure(order.payment, "CONFLICT");
      const newlyRequested = r.status === "requested";
      await tx.refund.update({
        where: { id: r.id },
        data: {
          status: "processing",
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      return {
        refund: r,
        transactionId: order.payment.transactionId,
        newlyRequested,
        attempt: r.attempts + 1,
      };
    });
    if (!claim) return;
    let result: VerifiedRefund | null = null;
    try {
      result = await port.fetchRefund({
        transactionId: claim.transactionId,
        requestKey: claim.refund.requestKey,
      });
      // PaymentPort guarantees same-key idempotency, including a crash before send.
      // An adapter with a bounded PG idempotency window must return pending instead
      // of issuing an unsafe request after that window.
      if (!result)
        result = await port.refund({
          transactionId: claim.transactionId,
          requestKey: claim.refund.requestKey,
          amountWon: claim.refund.amountWon,
        });
    } catch {
      await sys.db.$transaction(async (tx) => {
        await lockOrder(tx, ref.orderId, sys.now());
        await tx.refund.updateMany({
          where: {
            id: refundId,
            attempts: claim.attempt,
            status: { in: ["processing", "pending"] },
          },
          data: { status: "pending", lastError: "PROVIDER_UNCERTAIN" },
        });
      });
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
    if (!result || result.status === "pending") {
      await sys.db.refund.updateMany({
        where: {
          id: refundId,
          attempts: claim.attempt,
          status: { in: ["processing", "pending"] },
        },
        data: { status: "pending", lastError: "PROVIDER_PENDING" },
      });
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
    ensure(
      result.transactionId === claim.transactionId &&
        result.requestKey === claim.refund.requestKey &&
        result.amountWon === claim.refund.amountWon,
      "CONFLICT",
    );
    const final = result;
    await sys.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, ref.orderId, sys.now());
      const r = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        include: { sessions: true },
      });
      if (
        ["succeeded", "failed"].includes(r.status) ||
        r.attempts !== claim.attempt
      )
        return;
      const rightIds = r.sessions.map((s) => s.enrollmentSessionId);
      if (final.status === "failed") {
        await tx.refund.update({
          where: { id: r.id },
          data: {
            status: "failed",
            lastError: "PROVIDER_DECLINED",
            providerReference: final.reference,
          },
        });
        await tx.enrollmentSession.updateMany({
          where: { id: { in: rightIds }, status: "refund_pending" },
          data: { status: "allowed" },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { exceptionReason: "REFUND_FAILED" },
        });
        return;
      }
      const sum = await tx.refund.aggregate({
        where: { orderId: order.id, status: "succeeded" },
        _sum: { amountWon: true },
      });
      const before = sum._sum.amountWon || 0,
        total = before + r.amountWon;
      ensure(total <= order.amountWon, "CONFLICT");
      await tx.refund.update({
        where: { id: r.id },
        data: {
          status: "succeeded",
          lastError: null,
          providerReference: final.reference,
          succeededAt: sys.now(),
        },
      });
      await tx.enrollmentSession.updateMany({
        where: { id: { in: rightIds } },
        data: { status: "cancelled" },
      });
      const all = total === order.amountWon;
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: all ? "refunded" : "partially_refunded",
          exceptionReason: null,
        },
      });
      await tx.payment.update({
        where: { id: r.paymentId },
        data: { status: all ? "refunded" : "partially_refunded" },
      });
      if (order.enrollment)
        await tx.enrollment.update({
          where: { id: order.enrollment.id },
          data: { status: all ? "cancelled" : "active" },
        });
      if (all && order.reservation)
        await tx.seatReservation.update({
          where: { orderId: order.id },
          data: { status: "released" },
        });
      const feeReturned =
        Math.floor((order.feeWon * total) / order.amountWon) -
        Math.floor((order.feeWon * before) / order.amountWon);
      for (const [kind, amount] of [
        ["refund", -r.amountWon],
        ["adjustment", -r.amountWon + feeReturned],
      ] as const) {
        const original = await tx.settlementEntry.findUnique({
          where: {
            idempotencyKey: `payment:${r.paymentId}:${kind === "refund" ? "payment" : "academy_due"}`,
          },
        });
        await tx.settlementEntry.create({
          data: {
            academyId: order.academyId,
            orderId: order.id,
            paymentId: r.paymentId,
            refundId: r.id,
            kind,
            amountWon: amount,
            idempotencyKey: `refund:${r.id}:${kind}`,
            originalEntryId: original?.id,
            createdAt: sys.now(),
          },
        });
      }
      await netAcademyBalances(tx, order.academyId, sys.now());
    });
    if (final.status === "failed") throw new AppError("PROVIDER_UNAVAILABLE");
  });
}

export function retryRefund(ctx: ServiceContext, refundId: string) {
  return attempt(async () => {
    const user = await requireActor(ctx);
    ensure(user.platformAdmin, "FORBIDDEN");
    z.uuid().parse(refundId);
    const ref = await ctx.db.refund.findUnique({
      where: { id: refundId },
      select: { orderId: true },
    });
    ensure(ref, "NOT_FOUND");
    await ctx.db.$transaction(async (tx) => {
      await lockOrder(tx, ref.orderId, ctx.now());
      const r = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        include: { sessions: { include: { enrollmentSession: true } } },
      });
      ensure(
        ["requested", "failed", "pending", "processing"].includes(r.status),
        "CONFLICT",
      );
      const job = await tx.job.findUnique({
        where: { dedupeKey: `refund:${r.id}` },
      });
      if (r.status === "requested")
        ensure(
          job &&
            (job.status === "failed" ||
              !!job.lastError ||
              (job.status === "processing" &&
                !!job.leaseUntil &&
                job.leaseUntil <= ctx.now())),
          "CONFLICT",
        );
      if (job) {
        ensure(
          job.status !== "processing" ||
            (!!job.leaseUntil && job.leaseUntil <= ctx.now()),
          "CONFLICT",
        );
        const changed = await tx.job.updateMany({
          where: {
            id: job.id,
            status: job.status,
            claimToken: job.claimToken,
            attempts: job.attempts,
            leaseUntil: job.leaseUntil,
          },
          data: {
            status: "pending",
            attempts: 0,
            runAt: ctx.now(),
            claimToken: null,
            claimedBy: null,
            leaseUntil: null,
            lastError: null,
          },
        });
        ensure(changed.count === 1, "CONFLICT");
      }
      if (r.status === "failed") {
        ensure(
          r.sessions.every(
            (s) =>
              s.enrollmentSession.status === "allowed" &&
              !s.enrollmentSession.completedAt &&
              s.enrollmentSession.startsAt > ctx.now(),
          ),
          "CONFLICT",
        );
        await tx.enrollmentSession.updateMany({
          where: { id: { in: r.sessions.map((s) => s.enrollmentSessionId) } },
          data: { status: "refund_pending" },
        });
        await tx.refund.update({
          where: { id: r.id },
          data: { status: "requested", lastError: null },
        });
      }
      if (!job)
        await tx.job.create({
          data: {
            type: "refund",
            dedupeKey: `refund:${r.id}`,
            payloadJson: { refundId: r.id, orderId: r.orderId },
            runAt: ctx.now(),
          },
        });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "refund.retry",
          targetId: r.id,
          reason: "운영자 재처리",
          createdAt: ctx.now(),
        },
      });
    });
    return { refundId };
  });
}
