import { handle, readJson } from "@/server/http";
import {
  listPlatformAdmins,
  managePlatformAdminByEmail,
} from "@/modules/identity/operators";

export function GET(request: Request) {
  return handle(request, (ctx) => listPlatformAdmins(ctx));
}

export function POST(request: Request) {
  return handle(
    request,
    async (ctx) =>
      managePlatformAdminByEmail(
        ctx,
        (await readJson(request)) as Parameters<
          typeof managePlatformAdminByEmail
        >[1],
      ),
    true,
  );
}
