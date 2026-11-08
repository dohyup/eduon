import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { issueStudentInvitation } from "@/modules/identity/guardian-links";
import { deliverInvitation } from "@/integrations/mail/provider";
export function POST(r: Request) {
  return handle(
    r,
    async (ctx) => {
      const data = z
        .object({ studentId: z.uuid(), email: z.email() })
        .strict()
        .parse(await readJson(r));
      const result = await issueStudentInvitation(
        ctx,
        data.studentId,
        data.email,
      );
      return result.ok
        ? {
            ok: true,
            value: {
              ...(await deliverInvitation(
                "student",
                result.value.token,
                data.email,
              )),
              invitationId: result.value.invitationId,
            },
          }
        : result;
    },
    true,
  );
}
