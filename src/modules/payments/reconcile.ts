import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ServiceContext, SystemContext } from "@/server/context";
import type { PaymentPort } from "@/integrations/payments/port";
import { requireActor } from "@/modules/identity/access";
import { attempt, ensure, AppError } from "@/server/errors";

async function enqueue(
  tx: Prisma.TransactionClient,
  now: Date,
  type: string,
  dedupeKey: string,
  payloadJson: Prisma.InputJsonObject,
  repeat = false,
) {
  await tx.job.upsert({
    where: { dedupeKey },
    create: { type, dedupeKey, payloadJson, runAt: now },
    update: {},
  });
  if (repeat)
    await tx.job.updateMany({
      where: { dedupeKey, status: "succeeded" },
      data: { status: "pending", attempts: 0, runAt: now, lastError: null },
    });
}

/** Serialize cursor advancement with the enqueue commit; no provider calls here. */
async function scan<T extends { id: string }>(
  sys: SystemContext,
  name: string,
  read: (
    tx: Prisma.TransactionClient,
    cursor: string | undefined,
  ) => Promise<T[]>,
  schedule: (
    tx: Prisma.TransactionClient,
    rows: T[],
    now: Date,
  ) => Promise<void>,
) {
  return sys.db.$transaction(
    async (tx) => {
      const now = sys.now(),
        dedupeKey = `scan:${name}`;
      // A nonempty ORM upsert update locks this schema-qualified row. Another
      // scanner waits, then receives the cursor committed by its predecessor.
      const marker = await tx.job.upsert({
        where: { dedupeKey },
        create: {
          type: "reconciliation_cursor",
          status: "succeeded",
          dedupeKey,
          payloadJson: {},
          runAt: now,
        },
        update: { updatedAt: now },
      });
      const state = z
        .object({ cursorId: z.uuid().optional() })
        .parse(marker.payloadJson);
      let rows = await read(tx, state.cursorId);
      // At most two queries of <=100 rows; wrap only after reaching the end.
      if (!rows.length && state.cursorId) rows = await read(tx, undefined);
      await schedule(tx, rows, now);
      await tx.job.update({
        where: { id: marker.id },
        data: {
          payloadJson: rows.length ? { cursorId: rows.at(-1)!.id } : {},
          updatedAt: now,
        },
      });
      return rows.length;
    },
    { timeout: 15_000 },
  );
}

/** Rebuild missing durable work, then let leased workers retrieve provider facts. */
export async function reconcilePayments(
  sys: SystemContext,
  _port?: PaymentPort,
) {
  // Retrieval belongs to the leased job, so provider outages never lose scans.
  void _port;
  const checked = await scan(
    sys,
    "payments",
    (tx, cursor) =>
      tx.payment.findMany({
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          OR: [
            { status: "pending" },
            {
              status: {
                in: ["paid", "partially_refunded", "refunded", "cancelled"],
              },
              order: {
                OR: [
                  {
                    status: {
                      in: ["pending_payment", "expired", "payment_exception"],
                    },
                  },
                  {
                    refunds: {
                      some: {
                        status: { in: ["requested", "processing", "pending"] },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
        select: { id: true, orderId: true },
        orderBy: { id: "asc" },
        take: 100,
      }),
    async (tx, rows, now) => {
      for (const p of rows)
        await enqueue(
          tx,
          now,
          "reconcile",
          `reconcile:${p.orderId}`,
          { orderId: p.orderId },
          true,
        );
    },
  );
  await scan(
    sys,
    "events",
    (tx, cursor) =>
      tx.providerEvent.findMany({
        where: { status: "pending", ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true },
        orderBy: { id: "asc" },
        take: 100,
      }),
    async (tx, rows, now) => {
      for (const e of rows)
        await enqueue(tx, now, "payment_event", `event:${e.id}`, {
          eventId: e.id,
        });
    },
  );
  await scan(
    sys,
    "refunds",
    (tx, cursor) =>
      tx.refund.findMany({
        where: {
          status: { in: ["requested", "processing", "pending"] },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true },
        orderBy: { id: "asc" },
        take: 100,
      }),
    async (tx, rows, now) => {
      for (const r of rows)
        await enqueue(tx, now, "refund", `refund:${r.id}`, { refundId: r.id });
    },
  );
  return { checked };
}

/** The scheduler nonce is committed before any expiration or external work. */
export async function claimSchedulerNonce(sys: SystemContext, nonce: string) {
  z.string()
    .regex(/^[a-fA-F0-9]{32}$/)
    .parse(nonce);
  try {
    await sys.db.job.create({
      data: {
        type: "scheduler",
        status: "succeeded",
        dedupeKey: `scheduler:${nonce.toLowerCase()}`,
        payloadJson: {},
        runAt: sys.now(),
        createdAt: sys.now(),
      },
    });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false;
    throw error;
  }
}

export type PaymentException = {
  id: string;
  orderId: string;
  refundId?: string;
  retryJobId?: string;
  canRetry: boolean;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextRunAt: string | null;
};
function canRetryJob(
  job: { status: string; lastError: string | null; leaseUntil: Date | null },
  now: Date,
) {
  return (
    (!job.leaseUntil || job.leaseUntil <= now) &&
    (job.status === "failed" ||
      (job.status === "pending" && !!job.lastError) ||
      (job.status === "processing" &&
        !!job.leaseUntil &&
        job.leaseUntil <= now))
  );
}
export function retryJob(ctx: ServiceContext, id: string) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    ensure(actor.platformAdmin, "FORBIDDEN");
    z.uuid().parse(id);
    const now = ctx.now();
    const job = await ctx.db.job.findUnique({ where: { id } });
    ensure(job, "NOT_FOUND");
    ensure(
      [
        "payment_event",
        "refund",
        "reconcile",
        "order",
        "complete_offering",
      ].includes(job.type),
      "CONFLICT",
    );
    ensure(canRetryJob(job, now), "CONFLICT");
    if (job.type === "refund") {
      const { refundId } = z
        .object({ refundId: z.uuid() })
        .parse(job.payloadJson);
      // This service rechecks the lease under its transaction and restores
      // failed session rights atomically, retaining the provider request key.
      const { retryRefund } = await import("./refunds");
      const result = await retryRefund(ctx, refundId);
      if (!result.ok) throw new AppError(result.code);
      return { jobId: id };
    }
    await ctx.db.$transaction(async (tx) => {
      const changed = await tx.job.updateMany({
        where: {
          id: job.id,
          status: job.status,
          attempts: job.attempts,
          claimToken: job.claimToken,
          leaseUntil: job.leaseUntil,
          lastError: job.lastError,
        },
        data: {
          status: "pending",
          attempts: 0,
          runAt: now,
          claimToken: null,
          claimedBy: null,
          leaseUntil: null,
          lastError: null,
          updatedAt: now,
        },
      });
      ensure(changed.count === 1, "CONFLICT");
      if (job.type === "payment_event") {
        const { eventId } = z
          .object({ eventId: z.uuid() })
          .parse(job.payloadJson);
        await tx.providerEvent.updateMany({
          where: { id: eventId, status: { not: "processed" } },
          data: { status: "pending", lastError: null },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "job.retry",
          targetId: id,
          reason: "운영자 작업 재처리",
          createdAt: now,
        },
      });
    });
    return { jobId: id };
  });
}
export function getPaymentExceptions(ctx: ServiceContext, cursor?: string) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    ensure(actor.platformAdmin, "FORBIDDEN");
    z.uuid().optional().parse(cursor);
    const anchor = cursor
      ? ((await ctx.db.job.findUnique({
          where: { id: cursor },
          select: { id: true, createdAt: true },
        })) ??
        (await ctx.db.order.findUnique({
          where: { id: cursor },
          select: { id: true, createdAt: true },
        })))
      : null;
    if (cursor) ensure(anchor, "NOT_FOUND");
    const boundary = anchor
      ? {
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            { createdAt: anchor.createdAt, id: { lt: anchor.id } },
          ],
        }
      : {};
    const rows = await ctx.db.job.findMany({
      where: {
        AND: [
          boundary,
          {
            type: {
              in: [
                "payment_event",
                "refund",
                "reconcile",
                "order",
                "complete_offering",
              ],
            },
            OR: [{ status: "failed" }, { lastError: { not: null } }],
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
    });
    const items: (PaymentException & { createdAt: Date })[] = [];
    for (const job of rows) {
      const payload = z
        .object({
          orderId: z.uuid().optional(),
          refundId: z.uuid().optional(),
          eventId: z.uuid().optional(),
        })
        .safeParse(job.payloadJson);
      let orderId = payload.success ? payload.data.orderId : undefined;
      const refundId = payload.success ? payload.data.refundId : undefined;
      if (!orderId && refundId)
        orderId = (
          await ctx.db.refund.findUnique({
            where: { id: refundId },
            select: { orderId: true },
          })
        )?.orderId;
      if (!orderId && payload.success && payload.data.eventId) {
        const event = await ctx.db.providerEvent.findUnique({
          where: { id: payload.data.eventId },
          select: { transactionId: true },
        });
        if (event)
          orderId = (
            await ctx.db.payment.findUnique({
              where: { transactionId: event.transactionId },
              select: { orderId: true },
            })
          )?.orderId;
      }
      items.push({
        id: job.id,
        orderId: orderId ?? "",
        ...(refundId ? { refundId } : {}),
        retryJobId: job.id,
        canRetry: canRetryJob(job, ctx.now()),
        kind: job.type,
        status: job.status,
        attempts: job.attempts,
        lastError: job.lastError,
        nextRunAt: job.status === "pending" ? job.runAt.toISOString() : null,
        createdAt: job.createdAt,
      });
    }
    const orders = await ctx.db.order.findMany({
      where: {
        AND: [
          boundary,
          {
            OR: [
              { status: "payment_exception" },
              { exceptionReason: { not: null } },
            ],
          },
        ],
      },
      include: {
        refunds: {
          where: { status: { not: "succeeded" } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
    });
    for (const order of orders) {
      const refund = order.refunds[0];
      items.push({
        id: order.id,
        orderId: order.id,
        ...(refund ? { refundId: refund.id } : {}),
        canRetry: false,
        kind: "order",
        status: order.status,
        attempts: refund?.attempts ?? 0,
        lastError: order.exceptionReason,
        nextRunAt: null,
        createdAt: order.createdAt,
      });
    }
    items.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id),
    );
    return {
      items: items.slice(0, 20).map((item) => ({
        id: item.id,
        orderId: item.orderId,
        ...(item.refundId ? { refundId: item.refundId } : {}),
        ...(item.retryJobId ? { retryJobId: item.retryJobId } : {}),
        canRetry: item.canRetry,
        kind: item.kind,
        status: item.status,
        attempts: item.attempts,
        lastError: item.lastError,
        nextRunAt: item.nextRunAt,
      })),
      nextCursor: items.length > 20 ? items[19].id : null,
    };
  });
}
