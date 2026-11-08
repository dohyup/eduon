import { WorkspaceEntry } from "@/components/workspace-entry";
import { notFound } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (id !== "math-1") notFound();
  return <WorkspaceEntry role="student" section="classes" />;
}
