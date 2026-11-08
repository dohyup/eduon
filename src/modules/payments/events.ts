import "server-only";
import type { SystemContext } from "@/server/context";
import type { PaymentPort } from "@/integrations/payments/port";
import { AppError, ensure } from "@/server/errors";
/** Persist the verified notification and work atomically before acknowledgement. */
export async function ingestPaymentEvent(
  sys: SystemContext,
  raw: Uint8Array,
  headers: Headers,
  port: PaymentPort,
) {
  let verified;
  try {
    verified = await port.verifyWebhook(raw, headers);
  } catch {
    throw new AppError("FORBIDDEN");
  }
  return sys.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`provider-event:${verified.eventId}`}))`;
    const old = await tx.providerEvent.findUnique({
      where: { eventId: verified.eventId },
    });
    if (old) {
      ensure(old.transactionId === verified.transactionId, "CONFLICT");
      return { accepted: true };
    }
    const event = await tx.providerEvent.create({
      data: {
        eventId: verified.eventId,
        transactionId: verified.transactionId,
        provider: "fake",
        payloadJson: {
          eventId: verified.eventId,
          transactionId: verified.transactionId,
        },
        createdAt: sys.now(),
      },
    });
    await tx.job.create({
      data: {
        type: "payment_event",
        dedupeKey: `event:${event.id}`,
        payloadJson: { eventId: event.id },
        runAt: sys.now(),
      },
    });
    return { accepted: true };
  });
}
