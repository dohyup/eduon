import { AccountDemo } from "@/components/workspace";
import { isDemoMode, authConfigured } from "@/server/config";
import { getActor } from "@/integrations/auth/provider";
import { getDatabase } from "@/server/db";
import Link from "next/link";

export default async function Page() {
  if (isDemoMode()) return <AccountDemo mode="onboarding" />;
  const actor = authConfigured() ? await getActor() : null;
  const user = actor
    ? await getDatabase().user.findUnique({ where: { id: actor.userId } })
    : null;
  return (
    <main id="main-content" className="container page-content">
      <span className="eyebrow">MY EDUON</span>
      <h1>나의 배움과 학원 운영</h1>
      <p>
        {user
          ? "계정에 연결된 자녀와 학원 소속을 각 공간에서 확인하세요."
          : "로그인 후 계정에 연결된 공간을 이용하세요. 인증 연결이 아직 없으면 로그인 화면에서 안내합니다."}
      </p>
      <div className="grid-2">
        {[
          ["학부모 공간", "/parent"],
          ["학생 계정 연결", "/learn"],
          ["학원 입점·운영", "/academy"],
          ["강사 소속·수업", "/instructor"],
          ...(user?.platformAdmin ? [["운영자 관리", "/admin"]] : []),
        ].map(([name, path]) => (
          <Link className="panel text-link" href={path} key={path}>
            {name} →
          </Link>
        ))}
      </div>
      <p className="muted">
        페이지를 선택해도 권한은 변경되지 않습니다. 학원 소속과 보호자 관계는
        서버에서 검사합니다.
      </p>
    </main>
  );
}
