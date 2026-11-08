import Link from "next/link";
import { DemoDialog } from "@/components/ui/dialog";
export default function Teach() {
  return (
    <main id="main-content" className="container page-content">
      <div className="teach-hero">
        <span className="eyebrow">A NEW CHAPTER FOR YOUR ACADEMY</span>
        <h1>
          가르침에 집중하세요.
          <br />
          연결은 EDUON이 준비합니다.
        </h1>
        <p>
          동네에서 쌓은 교육의 깊이가,
          <br />더 멀리 있는 학생에게도 닿을 수 있도록.
        </p>
        <DemoDialog label="입점 신청 체험" title="데모 입점 안내">
          <p>
            현재는 프로토타입으로 실제 입점 신청을 접수하지 않습니다. 원장
            화면에서 수업 개설과 운영 흐름을 확인할 수 있습니다.
          </p>
          <Link href="/academy" className="text-link">
            원장 데모로 이동 →
          </Link>
        </DemoDialog>
      </div>
      <div className="steps-grid section">
        {["학원 정보 등록", "운영자 검토·승인", "수업 개설·학생 연결"].map(
          (s, i) => (
            <div key={s} className="panel">
              <span className="eyebrow">STEP 0{i + 1}</span>
              <h2>{s}</h2>
              <p className="muted">
                {
                  [
                    "학원과 강사의 전문 분야를 소개합니다.",
                    "입점 자료를 확인하고 수업 공개를 준비합니다.",
                    "일정과 수강료를 등록하고 온라인에서 만납니다.",
                  ][i]
                }
              </p>
            </div>
          ),
        )}
      </div>
      <div className="panel">
        <h2>요금과 운영 정책</h2>
        <p>
          수수료·구독료·결제 및 정산 정책은 현재 확정 전입니다. 실제 운영 계약과
          요금은 서비스 출시 전에 안내합니다.
        </p>
      </div>
    </main>
  );
}
