export function GET() {
  return Response.json(
    { status: "ok", service: "eduon" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
