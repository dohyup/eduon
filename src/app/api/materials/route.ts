import { handleLearning, asPage } from "@/server/learning-http";
import { listMaterials } from "@/modules/learning/materials";
export function GET(r: Request) {
  const q = new URL(r.url).searchParams;
  return handleLearning(r, async (ctx) =>
    asPage(
      await listMaterials(ctx, {
        offeringId: q.get("offeringId") || "",
        studentId: q.get("studentId") || undefined,
        cursor: q.get("cursor") || undefined,
      }),
    ),
  );
}
