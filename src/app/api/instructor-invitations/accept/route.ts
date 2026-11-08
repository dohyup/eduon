import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { acceptInstructorInvitation } from "@/modules/academies/invitations";
export function POST(r: Request) {
  return handle(
    r,
    async (ctx) => {
      const data = z
        .object({ token: z.string().max(256) })
        .strict()
        .parse(await readJson(r));
      return acceptInstructorInvitation(ctx, data.token);
    },
    true,
  );
}
