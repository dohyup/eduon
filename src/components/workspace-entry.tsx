import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Workspace } from "./workspace";
import { LiveWorkspace } from "./live-workspace";
import type { WorkspaceRole } from "@/demo/workspaces";
import { isDemoMode, authConfigured } from "@/server/config";
import { getActor } from "@/integrations/auth/provider";
import { verifyTestSession } from "@/integrations/auth/test-session";
import { getDatabase } from "@/server/db";

const ADMIN_FALLBACK_SECRET =
  process.env.E2E_AUTH_SECRET ||
  process.env.ZOOM_TOKEN_ENCRYPTION_KEY ||
  "eduon-admin-fallback-session-secret-key-2026";

export async function WorkspaceEntry({
  role,
  section = "overview",
}: {
  role: WorkspaceRole;
  section?: string;
}) {
  if (isDemoMode()) return <Workspace role={role} section={section} />;
  const jar = await cookies();
  const adminCookie = jar.get("eduon-admin-session")?.value || "";
  const verifiedAdminId = verifyTestSession(
    adminCookie,
    ADMIN_FALLBACK_SECRET,
  );
  if (!authConfigured()) {
    if (verifiedAdminId) {
      return <Workspace role={role} section={section} />;
    }
    return (
      <main id="main-content" className="container page-content">
        <span className="eyebrow">EDUON P2 · 연결 준비</span>
        <h1>계정과 학원 관리를 시작할 준비</h1>
        <div className="panel">
          <h2>인증·데이터베이스 연결이 필요합니다</h2>
          <p>
            인증·자녀 연결·학원 승인·수업 개설 기능을 구현했습니다. Supabase
            프로젝트와 환경변수를 설정하면 실제 계정으로 사용할 수 있습니다.
          </p>
          <p>
            현재 연결되지 않은 상태를 로그인 성공이나 보호자 확인 완료로
            표시하지 않습니다.
          </p>
          <Link href="/login" className="button">
            로그인 연결 상태 확인
          </Link>
        </div>
      </main>
    );
  }
  const actor = await getActor();
  if (!actor) {
    if (verifiedAdminId) {
      return <Workspace role={role} section={section} />;
    }
    redirect("/login");
  }
  if (role === "admin") {
    let isPlatformAdmin = Boolean(verifiedAdminId);
    try {
      const user = await getDatabase().user.findUnique({
        where: { id: actor.userId },
      });
      if (user?.platformAdmin) isPlatformAdmin = true;
    } catch {
      // allow verifiedAdminId fallback if DB query fails
    }
    if (!isPlatformAdmin)
      return (
        <main id="main-content" className="container page-content">
          <h1>운영 권한이 필요합니다</h1>
          <p>이 계정은 운영자 페이지를 사용할 수 없습니다.</p>
          <Link href="/parent" className="button secondary">
            내 계정으로
          </Link>
        </main>
      );
  }
  return <LiveWorkspace role={role} section={section} />;
}
