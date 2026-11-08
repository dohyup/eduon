import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { acceptStudentInvitation } from "@/modules/identity/guardian-links";
export function POST(r: Request) {
  return handle(
    r,
    async (ctx) => {
      const data = z
        .object({ token: z.string().max(100) })
        .strict()
        .parse(await readJson(r));
      return acceptStudentInvitation(ctx, data.token);
    },
    true,
  );
}
