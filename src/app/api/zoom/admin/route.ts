import { handle, readJson } from "@/server/http";
import { getAdminZoomDashboard } from "@/modules/zoom/admin";
import { requestZoomReconnectionNotice } from "@/modules/zoom/account";
import { retryFailedZoomWebhookEvents } from "@/modules/zoom/webhook";

export function GET(r: Request) {
  return handle(r, (ctx) => getAdminZoomDashboard(ctx));
}

export function POST(r: Request) {
  return handle(
    r,
    async (ctx) => {
      const body = (await readJson(r)) as {
        action: "retry_webhooks" | "reconnect_notice";
        eventId?: string;
        instructorId?: string;
        reason?: string;
      };
      if (body?.action === "reconnect_notice") {
        return requestZoomReconnectionNotice(ctx, {
          instructorId: body.instructorId || "",
          reason: body.reason || "",
        });
      }
      return retryFailedZoomWebhookEvents(ctx, { eventId: body?.eventId });
    },
    true,
  );
}

