import { handle } from "@/server/http";
import { ensure, attempt } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { releaseConfiguration } from "@/server/release-gates";
import { paymentReadiness } from "@/integrations/payments/provider";
import { videoReadiness } from "@/integrations/video/provider";
import { learningEnabled } from "@/modules/learning/access";
export function GET(r: Request) {
  return handle(r, (ctx) =>
    attempt(async () => {
      const user = await requireActor(ctx);
      ensure(user.platformAdmin, "FORBIDDEN");
      let database = "unavailable",
        queue: "unknown" | number = "unknown";
      try {
        await ctx.db.$queryRaw`SELECT 1`;
        database = "reachable";
        if (learningEnabled())
          queue = await ctx.db.job.count({ where: { status: "failed" } });
      } catch {}
      return {
        ...releaseConfiguration(process.env, {
          payments: paymentReadiness().configured,
          video: videoReadiness().configured,
          storage: false,
          scanner: false,
        }),
        database,
        failedJobs: queue,
      };
    }),
  );
}
