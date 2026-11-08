import { InvitationLanding } from "@/components/invitation-landing";
export default async function Invitations({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const params = await searchParams;
  return (
    <main id="main-content" className="container page-content">
      <h1>초대를 확인하고 계정을 연결하세요</h1>
      <p>
        초대받은 이메일로 먼저 로그인하세요. 초대는 다른 계정으로 사용할 수
        없습니다.
      </p>
      <InvitationLanding
        kind={params.kind === "instructor" ? "instructor" : "student"}
      />
    </main>
  );
}
