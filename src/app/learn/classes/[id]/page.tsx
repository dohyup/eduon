import { LearningEntry } from "@/components/learning/entry";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ studentId?: string }>;
}) {
  const { id } = await params;
  const { studentId } = await searchParams;
  return (
    <LearningEntry
      offeringId={id}
      view={studentId ? "parent" : "student"}
      studentId={studentId}
    />
  );
}
