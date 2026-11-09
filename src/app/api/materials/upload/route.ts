import { z } from "zod";
import { handleLearning } from "@/server/learning-http";
import { AppError, ensure } from "@/server/errors";
import { uploadMaterial } from "@/modules/learning/materials";
async function readFile(r: Request) {
  ensure(
    r.headers.get("content-type") === "application/octet-stream",
    "VALIDATION",
  );
  const max = 10 * 1024 * 1024;
  ensure(Number(r.headers.get("content-length") || 0) <= max, "VALIDATION");
  const reader = r.body?.getReader();
  ensure(reader, "VALIDATION");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AppError("VALIDATION");
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
export function POST(r: Request) {
  return handleLearning(
    r,
    async (ctx) => {
      let filename: string;
      try {
        filename = decodeURIComponent(r.headers.get("x-file-name") || "");
      } catch {
        throw new AppError("VALIDATION");
      }
      const p = z
        .object({
          offeringId: z.uuid(),
          sessionId: z.uuid().optional(),
          purpose: z.enum(["material", "submission"]),
          filename: z.string().min(1).max(200),
          mime: z.string().min(1).max(100),
        })
        .strict()
        .parse({
          offeringId: r.headers.get("x-offering-id"),
          sessionId: r.headers.get("x-session-id") || undefined,
          purpose: r.headers.get("x-purpose"),
          filename,
          mime: r.headers.get("x-file-type"),
        });
      return uploadMaterial(ctx, { ...p, data: await readFile(r) });
    },
    true,
  );
}
