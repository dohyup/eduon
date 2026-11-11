import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, ArrowLeft, Video, Clock3, Users } from "lucide-react";
import { gradeLabel, levelLabel, money, schedule } from "@/demo/catalog";
import { getPublicOffering, getPublicAcademy } from "@/modules/catalog/public";
import { isDemoMode } from "@/server/config";
import { DemoDialog } from "@/components/ui/dialog";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const o = await getPublicOffering(id);
  const demo = isDemoMode();
  if (!o) notFound();
  const a = await getPublicAcademy(o.academyId);
  if (!a) notFound();
  return (
    <main id="main-content" className="container page-content">
      <Link className="back-link" href="/classes">
        <ArrowLeft size={16} />
        수업 목록으로
      </Link>
      <div className="detail-grid">
        <section>
          <div className="detail-intro">
            <span className="badge">
              {o.subject === "math" ? "수학" : "영어"} ·{" "}
              {gradeLabel(o.gradeMin)}–{gradeLabel(o.gradeMax)}
              {o.isZoomLive ? " · Zoom 라이브 강의" : ""}
            </span>
            <h1>{o.title}</h1>
            <p className="muted">
              정답을 넘어, 스스로 이해하고 설명하는 배움.
              <br />
              소그룹 안에서 아이의 질문에 귀 기울입니다.
            </p>
            <Link href={`/academies/${a.id}`} className="text-link">
              {a.name} · 학원 소개 보기 →
            </Link>
          </div>
          <div className="detail-facts">
            <span>
              <Video size={20} />
              {o.isZoomLive ? "Zoom 실시간 화상강의" : "실시간 온라인"}
            </span>
            <span>
              <Clock3 size={20} />
              회당 50분
            </span>
            <span>
              <Users size={20} />
              소그룹 수업
            </span>
          </div>
          <div className="panel">
            <h2>이런 아이에게 추천해요</h2>
            <ul className="check-list">
              <li>
                <Check size={18} />
                {levelLabel[o.level]}부터 차근차근 배우고 싶은 학생
              </li>
              <li>
                <Check size={18} />
                모르는 부분을 편하게 질문하고 싶은 학생
              </li>
              <li>
                <Check size={18} />
                자신의 생각을 설명하는 연습이 필요한 학생
              </li>
            </ul>
          </div>
          <div className="panel">
            <h2>수업에서는 이렇게 배워요</h2>
            {[
              "지난 시간의 배움을 함께 돌아봐요",
              "핵심 개념을 이해하고 직접 적용해요",
              "나의 풀이와 생각을 말로 정리해요",
            ].map((text, i) => (
              <div className="curriculum" key={text}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{text}</h3>
                  <p className="muted">
                    선생님의 질문과 개별 피드백으로 이해를 확인합니다.
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>회차별 수업 일정 및 실시간 입장 안내</h2>
            <p className="muted">
              수업 시작 10분 전부터 수강권 확인 후 실시간 Zoom 강의실에 입장할
              수 있으며, 시작 전에는 대기 화면이 제공됩니다.
            </p>
            <ul className="check-list">
              {o.sessions.map((s, idx) => (
                <li key={s.id}>
                  <Clock3 size={18} />
                  {idx + 1}회차:{" "}
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(s.startsAt))}{" "}
                  (한국시간)
                  {s.zoomStatus === "started"
                    ? " · 실시간 진행 중"
                    : s.zoomStatus === "ended"
                      ? " · 종료 (다시보기 지원)"
                      : " · 수업 전 대기"}
                </li>
              ))}
            </ul>
            {!demo && (
              <Link className="text-link" href={`/learn/classes/${o.id}`}>
                수강생 라이브 강의실 입장 확인 →
              </Link>
            )}
          </div>
          <div className="panel">
            <h2>신청 전에 확인해주세요</h2>
            <p>
              {demo
                ? "표시된 일정·가격·잔여석은 합성 예시입니다."
                : "수업 정보는 학원이 등록한 내용을 기준으로 합니다."}{" "}
              결제·수강권 발급은 다음 단계에서 연결됩니다.
            </p>
            <p className="muted">
              실제 서비스의 환불·취소 기준과 학원 검토 정보는 운영 정책 확정 후
              제공됩니다.
            </p>
          </div>
        </section>
        <aside className="booking-panel">
          <span className="eyebrow">CLASS INFORMATION</span>
          <h2>함께 시작하는 배움</h2>
          <dl>
            <div>
              <dt>대상</dt>
              <dd>
                {gradeLabel(o.gradeMin)}–{gradeLabel(o.gradeMax)} ·{" "}
                {levelLabel[o.level]}
              </dd>
            </div>
            <div>
              <dt>첫 수업{demo ? " 예시" : ""}</dt>
              <dd>{schedule(o)} (한국시간)</dd>
            </div>
            <div>
              <dt>수업 구성</dt>
              <dd>총 {o.sessions.length}회 · 회차별 일정 확인</dd>
            </div>
            <div>
              <dt>잔여석{demo ? " 예시" : ""}</dt>
              <dd>{o.availableSeats}석</dd>
            </div>
          </dl>
          <div className="booking-price">
            <small>
              {o.sessions.length}회 총 수강료{demo ? " 예시" : ""}
            </small>
            <strong>{money(o.priceWon)}</strong>
          </div>
          <DemoDialog
            label={demo ? "수강 신청" : "수강 신청 안내"}
            title={demo ? "데모 신청 안내" : "수강 신청 연동 준비 중"}
          >
            <p>
              {demo
                ? "선택한 수업은 가상 수업입니다."
                : "학원이 공개한 수업 정보입니다."}{" "}
              실제 결제 및 수강 신청은 아직 진행되지 않습니다.
            </p>
            <p className="muted">
              학부모가 자녀와 수업 일정을 확인하고 신청하는 흐름을 미리
              살펴보세요.
            </p>
            <Link className="text-link" href="/parent">
              학부모 화면으로 →
            </Link>
          </DemoDialog>
          <p className="caption">실제 결제 및 수강 불가</p>
        </aside>
      </div>
    </main>
  );
}
