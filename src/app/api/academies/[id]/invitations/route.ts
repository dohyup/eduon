import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { issueInstructorInvitation } from "@/modules/academies/invitations";
import { deliverInvitation } from "@/integrations/mail/provider";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(
    r,
    async (ctx) => {
      const data = z
        .object({ email: z.email() })
        .strict()
        .parse(await readJson(r));
      const result = await issueInstructorInvitation(ctx, {
        academyId: id,
        email: data.email,
      });
      return result.ok
        ? {
            ok: true,
            value: await deliverInvitation(
              "instructor",
              result.value.token,
              data.email,
            ),
          }
        : result;
    },
    true,
  );
}
