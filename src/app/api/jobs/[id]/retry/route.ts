import { handle } from "@/server/http";
import { retryJob } from "@/modules/payments/reconcile";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handle(request, (ctx) => retryJob(ctx, id), true);
}
