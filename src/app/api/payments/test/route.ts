import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { ensure } from "@/server/errors";
import { getTestPaymentProvider } from "@/integrations/payments/provider";
import { confirmPayment } from "@/modules/payments/confirm";
export function POST(r: Request) {
  return handle(
    r,
    async (ctx) => {
      const port = getTestPaymentProvider();
      const { orderId } = z
        .object({ orderId: z.uuid() })
        .strict()
        .parse(await readJson(r));
      const order = await ctx.db.order.findFirst({
        where: { id: orderId, parentId: ctx.actor.userId },
        include: { payment: true },
      });
      ensure(order, "NOT_FOUND");
      ensure(
        order.payment &&
          order.status === "pending_payment" &&
          order.expiresAt > ctx.now(),
        "CONFLICT",
      );
      await port.markPaid(order.payment.transactionId);
      return confirmPayment(
        ctx,
        { orderId, transactionId: order.payment.transactionId },
        port,
      );
    },
    true,
  );
}
