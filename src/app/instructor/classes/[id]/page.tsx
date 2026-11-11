import { WorkspaceEntry } from "@/components/workspace-entry";
import { ZoomClassroom } from "@/components/zoom-classroom";
import { getActor } from "@/integrations/auth/provider";
import { authConfigured, isDemoMode } from "@/server/config";
import { notFound, redirect } from "next/navigation";

const UUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isDemoMode() || !authConfigured() || id === "math-1") {
    if (id !== "math-1") notFound();
    return <WorkspaceEntry role="instructor" section="classes" />;
  }
  if (!UUID_RE.test(id)) notFound();
  const actor = await getActor();
  if (!actor) redirect("/login");
  return <ZoomClassroom targetId={id} role="instructor" />;
}
