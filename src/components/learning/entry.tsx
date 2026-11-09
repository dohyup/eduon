import Link from "next/link";
import { redirect } from "next/navigation";
import { authConfigured, isDemoMode } from "@/server/config";
import { getActor } from "@/integrations/auth/provider";
import { LearningDetail } from "./detail";
import type { LearningView } from "./shared";

export async function LearningEntry({
  offeringId,
  view,
  studentId,
}: {
  offeringId: string;
  view: LearningView;
  studentId?: string;
}) {
  if (isDemoMode() || !authConfigured())
    return (
      <main id="main-content" className="container page-content">
        <h1>학습 서비스 연결 준비</h1>
        <p>
          실제 수강 기록을 확인하려면 계정·데이터베이스·학습 서비스 설정이
          필요합니다.
        </p>
        <Link className="button secondary" href="/login">
          로그인 연결 상태 확인
        </Link>
      </main>
    );
  const actor = await getActor();
  if (!actor) redirect("/login");
  return (
    <LearningDetail offeringId={offeringId} view={view} studentId={studentId} />
  );
}
