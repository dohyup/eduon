import { z } from "zod";
import { getDatabase } from "@/server/db";
import { isDemoMode } from "@/server/config";
import { verifyJobRequest } from "@/server/job-auth";
import { runJobs } from "@/server/jobs";
import { expireReservations } from "@/modules/enrollment/expire";
import {
  claimSchedulerNonce,
  reconcilePayments,
} from "@/modules/payments/reconcile";
import { scheduleOfferingCompletions } from "@/modules/learning/completion";

export const runtime = "nodejs";
const bodySchema = z
  .object({ limit: z.number().int().min(1).max(100).default(25) })
  .strict();
async function readBody(request: Request): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }
  return raw;
}
export async function POST(request: Request) {
  try {
    const raw = await readBody(request);
    const now = new Date();
    const auth = verifyJobRequest(raw, request.headers, now.getTime());
    const parsed = bodySchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
    );
    if (isDemoMode())
      return Response.json({ error: "PROVIDER_UNAVAILABLE" }, { status: 503 });
    const sys = {
      db: getDatabase(),
      now: () => new Date(),
      source: "job" as const,
    };
    if (!(await claimSchedulerNonce(sys, auth.nonce)))
      return Response.json({ error: "JOB_REPLAY" }, { status: 409 });
    const expiration = await expireReservations(sys);
    const reconciliation = await reconcilePayments(sys);
    const completion = await scheduleOfferingCompletions(sys);
    const jobs = await runJobs(sys, parsed.limit);
    return Response.json({
      ...expiration,
      ...reconciliation,
      ...completion,
      ...jobs,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "JOB_FAILED";
    if (reason === "BODY_TOO_LARGE")
      return Response.json({ error: reason }, { status: 413 });
    if (reason === "JOB_UNAUTHORIZED")
      return Response.json({ error: reason }, { status: 401 });
    if (reason === "JOB_AUTH_UNCONFIGURED")
      return Response.json({ error: reason }, { status: 503 });
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof TypeError
    )
      return Response.json({ error: "VALIDATION" }, { status: 400 });
    return Response.json({ error: "JOB_FAILED" }, { status: 500 });
  }
}
