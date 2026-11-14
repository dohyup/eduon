import { isDemoMode } from "@/server/config";
import { getDatabase } from "@/server/db";
import { noStore } from "@/server/http";
import { processZoomWebhookRequest } from "@/modules/zoom/webhook";

export async function POST(r: Request) {
  if (isDemoMode()) {
    return Response.json(
      { ok: false, code: "UNAVAILABLE" },
      { status: 503, headers: noStore },
    );
  }
  const length = Number(r.headers.get("content-length") || 0);
  if (length > 131072) {
    return Response.json(
      { ok: false, code: "VALIDATION" },
      { status: 422, headers: noStore },
    );
  }
  const rawBody = await r.text();
  if (Buffer.byteLength(rawBody, "utf8") > 131072) {
    return Response.json(
      { ok: false, code: "VALIDATION" },
      { status: 422, headers: noStore },
    );
  }

  const db = getDatabase();
  const result = await processZoomWebhookRequest({
    db,
    rawBody,
    timestampHeader: r.headers.get("x-zm-request-timestamp"),
    signatureHeader: r.headers.get("x-zm-signature"),
    trackingHeader: r.headers.get("x-zm-trackingid"),
  });

  return Response.json(result.body, {
    status: result.status,
    headers: noStore,
  });
}

