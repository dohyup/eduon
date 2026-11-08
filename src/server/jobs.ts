import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Job } from "@/generated/prisma/client";
import type { SystemContext } from "@/server/context";
import type { PaymentPort } from "@/integrations/payments/port";
import { getPaymentProvider } from "@/integrations/payments/provider";
import { applyVerifiedPayment } from "@/modules/payments/confirm";
import { processRefund } from "@/modules/payments/refunds";
import { AppError } from "@/server/errors";

const leaseMs = 60_000;
const retryMinutes = [1, 5, 30];
const supportedTypes = ["payment_event", "refund", "reconcile", "order"];
const eventPayload = z.object({ eventId: z.uuid() });
const refundPayload = z.object({ refundId: z.uuid() });
const orderPayload = z.object({ orderId: z.uuid() });

async function claim(sys: SystemContext, worker: string): Promise<Job | null> {
  // An UPDATE predicate is rechecked under PostgreSQL row locking. Only one
  // contender can replace the observed token/status, including expired leases.
  for (let round = 0; round < 3; round++) {
    const now = sys.now();
    const rows = await sys.db.job.findMany({
      where: {
        type: { in: supportedTypes },
        OR: [
          { status: "pending", runAt: { lte: now } },
          { status: "processing", leaseUntil: { lte: now } },
        ],
      },
      orderBy: [{ runAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    if (!rows.length) return null;
    for (const row of rows) {
      const fence = {
        id: row.id,
        status: row.status,
        claimToken: row.claimToken,
        attempts: row.attempts,
        leaseUntil: row.leaseUntil,
        runAt: row.runAt,
      };
      if (row.attempts >= row.maxAttempts) {
        await sys.db.job.updateMany({
          where: fence,
          data: {
            status: "failed",
            lastError: "RETRY_EXHAUSTED",
            claimToken: null,
            claimedBy: null,
            leaseUntil: null,
            updatedAt: now,
          },
        });
        continue;
      }
      const token = randomUUID();
      const data = {
        status: "processing",
        attempts: row.attempts + 1,
        claimToken: token,
        claimedBy: worker,
        leaseUntil: new Date(now.getTime() + leaseMs),
        updatedAt: now,
      };
      const changed = await sys.db.job.updateMany({ where: fence, data });
      if (changed.count) return { ...row, ...data };
    }
  }
  return null;
}

async function execute(
  sys: SystemContext,
  job: Job,
  port: PaymentPort,
): Promise<string | undefined> {
  if (job.type === "payment_event") {
    const { eventId } = eventPayload.parse(job.payloadJson);
    const event = await sys.db.providerEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new AppError("NOT_FOUND");
    if (event.status === "processed") return event.id;
    const payment = await port.fetchPayment(event.transactionId);
    if (payment.transactionId !== event.transactionId)
      throw new AppError("CONFLICT");
    const result = await applyVerifiedPayment(sys, payment);
    if (!result.ok) throw new AppError(result.code);
    return event.id;
  }
  if (job.type === "refund") {
    const { refundId } = refundPayload.parse(job.payloadJson);
    const result = await processRefund(sys, refundId, port);
    if (!result.ok) throw new AppError(result.code);
    return;
  }
  const { orderId } = orderPayload.parse(job.payloadJson);
  const payment = await sys.db.payment.findUnique({ where: { orderId } });
  if (!payment) throw new AppError("NOT_FOUND");
  const verified = await port.fetchPayment(payment.transactionId);
  if (
    verified.orderId !== orderId ||
    verified.transactionId !== payment.transactionId
  )
    throw new AppError("CONFLICT");
  const result = await applyVerifiedPayment(sys, verified);
  if (!result.ok) throw new AppError(result.code);
}

/** Provider calls run after the atomic claim has committed. */
export async function runJobs(
  sys: SystemContext,
  limit: number,
  injectedPort?: PaymentPort,
) {
  z.number().int().min(1).max(100).parse(limit);
  const port = injectedPort ?? getPaymentProvider();
  const worker = randomUUID();
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const job = await claim(sys, worker);
    if (!job) break;
    try {
      const eventId = await execute(sys, job, port);
      const finished = await sys.db.$transaction(async (tx) => {
        const changed = await tx.job.updateMany({
          where: {
            id: job.id,
            status: "processing",
            claimToken: job.claimToken,
          },
          data: {
            status: "succeeded",
            lastError: null,
            leaseUntil: null,
            claimToken: null,
            claimedBy: null,
            updatedAt: sys.now(),
          },
        });
        if (changed.count && eventId)
          await tx.providerEvent.update({
            where: { id: eventId },
            data: {
              status: "processed",
              attempts: { increment: 1 },
              lastError: null,
              processedAt: sys.now(),
            },
          });
        return changed.count;
      });
      processed += finished;
    } catch (error) {
      // Never persist provider response bodies, secrets, URLs or arbitrary errors.
      const code =
        error instanceof AppError
          ? error.code
          : error instanceof z.ZodError
            ? "INVALID_JOB_PAYLOAD"
            : "PROVIDER_UNAVAILABLE";
      const terminal = job.attempts >= job.maxAttempts;
      const now = sys.now();
      await sys.db.$transaction(async (tx) => {
        const changed = await tx.job.updateMany({
          where: {
            id: job.id,
            status: "processing",
            claimToken: job.claimToken,
          },
          data: {
            status: terminal ? "failed" : "pending",
            lastError: code,
            runAt: new Date(
              now.getTime() +
                retryMinutes[Math.min(job.attempts - 1, 2)] * 60_000,
            ),
            leaseUntil: null,
            claimToken: null,
            claimedBy: null,
            updatedAt: now,
          },
        });
        const payload = eventPayload.safeParse(job.payloadJson);
        if (changed.count && job.type === "payment_event" && payload.success)
          await tx.providerEvent.updateMany({
            where: { id: payload.data.eventId, status: { not: "processed" } },
            data: {
              status: terminal ? "failed" : "pending",
              attempts: { increment: 1 },
              lastError: code,
            },
          });
      });
    }
  }
  return { processed };
}
