import { z } from "zod";
import { handleLearning } from "@/server/learning-http";
import { readJson } from "@/server/http";
import { ensure } from "@/server/errors";
import { paymentReadiness } from "@/integrations/payments/provider";
import { startReenrollment } from "@/modules/learning/reenroll";
export function POST(r: Request) {
  return handleLearning(
    r,
    async (ctx) => {
      ensure(paymentReadiness().configured, "PROVIDER_UNAVAILABLE");
      const p = z
        .object({
          enrollmentId: z.uuid(),
          nextOfferingId: z.uuid(),
          requestKey: z.string().min(1).max(120),
          consent: z.literal(true),
        })
        .strict()
        .parse(await readJson(r));
      return startReenrollment(ctx, p);
    },
    true,
  );
}
