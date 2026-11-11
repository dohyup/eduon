import { handle, readJson } from "@/server/http";
import {
  disconnectZoomAccount,
  getMyZoomAccount,
  initiateZoomOAuth,
} from "@/modules/zoom/account";

export function GET(r: Request) {
  return handle(r, (ctx) => getMyZoomAccount(ctx));
}

export function POST(r: Request) {
  return handle(
    r,
    async (ctx) => {
      const body = (await readJson(r)) as {
        action?: string;
        redirectPath?: string;
      };
      if (body?.action === "disconnect") {
        return disconnectZoomAccount(ctx);
      }
      return initiateZoomOAuth(ctx, { redirectPath: body?.redirectPath });
    },
    true,
  );
}

export function DELETE(r: Request) {
  return handle(r, (ctx) => disconnectZoomAccount(ctx), true);
}

