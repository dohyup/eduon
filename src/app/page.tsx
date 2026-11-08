import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  BookOpen,
  Search,
  CalendarDays,
  Video,
  ShieldCheck,
} from "lucide-react";
import { OfferingCard } from "@/components/catalog/offering-card";
import { listPublicOfferings } from "@/modules/catalog/public";
import { isDemoMode } from "@/server/config";
export default async function Home() {
  const { items: demoOfferings } = await listPublicOfferings();
  return (
    <main id="main-content">
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-line" />
              배움의 거리는 가까워지고, 가능성은 넓어지도록
            </div>
            <h1>
              우리 아이에게 맞는 수업,
              <br />
              <span>믿을 수 있는 학원에서.</span>
            </h1>
            <p>
              동네 학원의 세심한 가르침을, 이제 어디서나.
              <br className="desktop-break" />
              아이의 속도에 맞는 배움을 온라인으로 연결합니다.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/classes">
                수업 찾기
                <ArrowRight size={18} />
              </Link>
              <Link className="hero-text-link" href="/teach">
                학원을 운영하시나요?
                <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="hero-checks">
              <span>
                <Check size={15} />
                수준에 맞는 소그룹
              </span>
              <span>
                <Check size={15} />
                실시간 온라인 수업
              </span>
            </div>
          </div>
          <div className="hero-visual" aria-label="학생의 배움 일정 예시">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="learning-note">
              <span className="note-icon">
                <BookOpen size={21} />
              </span>
              <div>
                <strong>조금씩, 나답게 성장하는 중</strong>
                <small>한 번의 이해가 다음 배움의 시작이 됩니다.</small>
              </div>
            </div>
            <div className="schedule-card">
              <div className="schedule-top">
                <div>
                  <span className="eyebrow">MY LEARNING</span>
                  <h2>오늘의 배움</h2>
                </div>
                <span className="badge green">예시 일정</span>
              </div>
              <div className="week-strip">
                {["월", "화", "수", "목", "금"].map((d, i) => (
                  <div key={d} className={i === 2 ? "selected" : ""}>
                    <small>{d}</small>
                    <strong>{5 + i}</strong>
                    {i === 2 && <span />}
                  </div>
                ))}
              </div>
              <div className="lesson-preview">
                <span className="lesson-time">
                  17:00<span>50분</span>
                </span>
                <div>
                  <span className="badge">수학 · 초등</span>
                  <h3>개념이 연결되는 순간</h3>
                  <p>이음수학 배움교실</p>
                </div>
                <span className="lesson-arrow">
                  <ArrowUpRight size={20} />
                </span>
              </div>
              <div className="schedule-bottom">
                <span>
                  <Video size={15} />
                  집에서도 선생님과 함께
                </span>
                <span>DEMO</span>
              </div>
            </div>
            <div className="growth-note">
              <span>매일의 작은 이해가</span>
              <strong>더 큰 가능성으로.</strong>
              <div className="growth-bars">
                {[20, 30, 25, 44, 38, 60, 72].map((h, i) => (
                  <i key={i} style={{ height: h }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="values-strip">
        <div className="container values-grid">
          <div>
            <Search />
            <span>
              <strong>아이에게 맞게</strong>
              <small>과목·학년·수준별 탐색</small>
            </span>
          </div>
          <div>
            <Video />
            <span>
              <strong>거리의 제약 없이</strong>
              <small>지역을 넘어 만나는 선생님</small>
            </span>
          </div>
          <div>
            <ShieldCheck />
            <span>
              <strong>배움의 과정까지</strong>
              <small>수업·과제·피드백을 한곳에서</small>
            </span>
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FIND YOUR NEXT CLASS</span>
            <h2>아이의 다음 배움을 찾아보세요</h2>
            <p className="muted">
              기초를 다지는 수학부터, 생각을 넓히는 영어까지.
            </p>
          </div>
          <Link className="text-link" href="/classes">
            전체 수업 보기
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="course-grid">
          {demoOfferings.slice(0, 3).map((o) => (
            <OfferingCard key={o.id} offering={o} />
          ))}
        </div>
        <p className="caption">
          {isDemoMode()
            ? "화면 이해를 위한 가상 수업입니다. 실제 모집 중인 수업이 아닙니다."
            : demoOfferings.length
              ? "학원에서 공개한 수업입니다. 결제·수강 신청 연동은 준비 중입니다."
              : "아직 공개된 수업이 없습니다. 학원 등록과 인증 서비스 연결을 준비하고 있습니다."}
        </p>
      </section>
      <section className="steps-section">
        <div className="container">
          <span className="eyebrow">A SIMPLE START</span>
          <h2>좋은 배움의 시작은, 어렵지 않게.</h2>
          <div className="steps-grid">
            {[
              {
                icon: Search,
                title: "아이에게 맞는 수업 탐색",
                text: "과목과 수준, 가능한 시간을 확인하세요.",
              },
              {
                icon: CalendarDays,
                title: "일정과 수업 내용 확인",
                text: "선생님과 수업료를 충분히 살펴보세요.",
              },
              {
                icon: BookOpen,
                title: "수업부터 피드백까지",
                text: "배움의 과정을 한곳에서 함께 확인하세요.",
              },
            ].map((s, i) => (
              <div className="step" key={s.title}>
                <span className="step-no">0{i + 1}</span>
                <s.icon size={25} />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="container section">
        <div className="academy-cta">
          <div>
            <span className="eyebrow">FOR ACADEMIES</span>
            <h2>
              좋은 가르침이,
              <br />더 많은 아이를 만날 수 있도록.
            </h2>
            <p>
              온라인 수업 개설부터 수강생 관리까지.
              <br />
              학원의 다음 걸음을 EDUON이 함께 준비합니다.
            </p>
            <Link href="/teach" className="button">
              학원 입점 알아보기
              <ArrowRight size={17} />
            </Link>
          </div>
          <div className="cta-illustration" aria-hidden="true">
            <BookOpen size={100} strokeWidth={1} />
            <span>
              LOCAL EXPERTISE.
              <br />
              BOUNDLESS LEARNING.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
