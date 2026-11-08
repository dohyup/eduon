import { handle } from "@/server/http";
import { revokeStudentInvitation } from "@/modules/identity/guardian-links";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(r, (ctx) => revokeStudentInvitation(ctx, id), true);
}
