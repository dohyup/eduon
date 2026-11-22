import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  BookOpen,
  Video,
  ShieldCheck,
  Sparkles,
  MessageCircle,
  CheckCircle2,
  Users,
} from "lucide-react";
import { OfferingCard } from "@/components/catalog/offering-card";
import { SmartSearchTabs } from "@/components/catalog/smart-search-tabs";
import { listPublicOfferings } from "@/modules/catalog/public";
import { isDemoMode } from "@/server/config";

export default async function Home() {
  const { items: demoOfferings } = await listPublicOfferings(
    {},
    { fetchAll: true },
  );
  const demo = isDemoMode();

  return (
    <main id="main-content">
      {/* Stitch Today's Live Session Quick Bar */}
      <section className="today-live-bar" aria-label="오늘의 실시간 수업 바로가기">
        <div className="container today-live-inner">
          <div className="today-live-info">
            <span className="live-badge-emerald">
              <span className="live-badge-dot" />
              LIVE
            </span>
            <p className="today-live-text">
              <strong>오늘의 실시간 화상수업</strong>
              <span className="today-live-divider" aria-hidden="true">
                |
              </span>
              <span>
                이음수학 배움교실 · <strong>개념이 연결되는 순간</strong> (17:00
                시작 · 웹 내장 Zoom 강의실)
              </span>
            </p>
          </div>
          <div className="today-live-actions">
            <Link
              className="today-live-enter-btn"
              href={demo ? "/learn/classes/math-1" : "/learn"}
            >
              <Video size={15} />
              실시간 강의실 입장 (Live Room)
            </Link>
            <Link
              className="today-live-sub-btn"
              href={demo ? "/parent" : "/onboarding"}
            >
              내 배움터 확인
            </Link>
          </div>
        </div>
      </section>

      {/* Stitch Hero Spotlight Section */}
      <section className="hero">
        <div className="container">
          <div className="hero-spotlight">
            <div className="hero-grid">
              <div className="hero-copy">
                <div className="hero-top-pills">
                  <span className="hero-pill-primary">
                    <Sparkles size={13} />
                    EDUON 배움이음터 스마트 라이브
                  </span>
                  <span className="hero-pill-rating">
                    ★ 학부모·수강생 만족도 99.4%
                  </span>
                </div>
                <h1>
                  우리 아이에게 맞는 수업,
                  <br />
                  <span>믿을 수 있는 학원에서 라이브로</span>
                </h1>
                <p>
                  동네 학원의 세심한 가르침부터 검증된 소그룹 밀착 코칭까지.
                  <br className="desktop-break" />
                  별도 프로그램 설치 없이 웹 브라우저에서 바로 선생님과 실시간으로
                  만나보세요.
                </p>
                <div className="hero-actions">
                  <Link className="button hero-cta-primary" href="/classes">
                    수업 찾기
                    <ArrowRight size={18} />
                  </Link>
                  <Link className="hero-text-link" href="/teach">
                    학원을 운영하시나요?
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
                <div className="hero-social-proof">
                  <div className="avatar-stack" aria-hidden="true">
                    <span className="avatar-item av-blue">김</span>
                    <span className="avatar-item av-indigo">박</span>
                    <span className="avatar-item av-emerald">이</span>
                    <span className="avatar-item av-dark">+1.2k</span>
                  </div>
                  <p className="social-proof-copy">
                    오늘 <strong>1,482명</strong>의 학생이 EDUON 실시간 화상
                    교실에서 맞춤 수업을 이어가고 있습니다.
                  </p>
                </div>
                <div className="hero-checks">
                  <span>
                    <Check size={16} />
                    수준별 4~6명 소그룹
                  </span>
                  <span>
                    <Check size={16} />웹 내장형 Zoom 라이브
                  </span>
                  <span>
                    <Check size={16} />
                    출결·과제·피드백 통합
                  </span>
                </div>
              </div>

              <div className="hero-visual" aria-label="학생의 배움 일정 예시">
                <div className="schedule-card">
                  <div className="schedule-live-header">
                    <span className="schedule-live-tag">
                      <span className="live-pulse-dot" />
                      EDUON LIVE CLASSROOM
                    </span>
                    <span className="schedule-cap-tag">4명 정원 소그룹</span>
                  </div>
                  <div className="schedule-top">
                    <div>
                      <span className="eyebrow">오늘의 수업 일정</span>
                      <h2>오늘의 배움</h2>
                    </div>
                    <span className="badge green">양방향 실시간 판서</span>
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
                      <p>이음수학 배움교실 · 실시간 Q&amp;A 피드백</p>
                    </div>
                    <Link
                      href="/classes/math-1"
                      className="lesson-arrow"
                      aria-label="개념이 연결되는 순간 상세 보기"
                    >
                      <ArrowUpRight size={18} />
                    </Link>
                  </div>
                  <div className="schedule-bottom">
                    <span>
                      <Video size={16} />
                      브라우저 내장 Zoom SDK 교실
                    </span>
                    <span className="schedule-status-chip">즉시 입장 가능</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stitch 2-Mode Custom Search Tabs: 1. Natural Language Search / 2. Smart Filter */}
      <SmartSearchTabs offerings={demoOfferings} />

      {/* Stitch 1:1 Counseling Banner */}
      <section className="container counseling-section" aria-label="1:1 맞춤 학습 상담 안내">
        <div className="counseling-banner">
          <div className="counseling-copy">
            <div className="counseling-icon-box" aria-hidden="true">
              <MessageCircle size={24} />
            </div>
            <div>
              <div className="counseling-badges">
                <span className="counseling-pill-fast">평균 응답 5분 이내</span>
                <span className="counseling-sub">
                  학부모 · 학생 1:1 사전 커리큘럼 안내
                </span>
              </div>
              <h2>
                궁금한 점은 수강 전이라도 담당 학원·강사진의 상세 커리큘럼과
                피드백 방식을 먼저 확인해보세요!
              </h2>
            </div>
          </div>
          <Link href="/classes" className="counseling-cta-btn">
            전체 수업 비교하기
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Stitch Featured Courses Section */}
      <section className="section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              <CheckCircle2 size={14} />
              모집 중인 실시간 수업 · 3초 핵심 비교
            </span>
            <h2>아이의 다음 배움을 찾아보세요</h2>
            <p className="muted">
              기초를 다지는 수학부터 생각을 넓히는 영어까지, 학원별 강점과 수강
              후기 키워드를 한눈에 비교해보세요.
            </p>
          </div>
          <Link className="text-link" href="/classes">
            전체 수업 보기
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="comparison-tabs" aria-label="추천 분류">
          <Link href="/classes" className="comp-tab active">
            ★ 실시간 만족도 우수
          </Link>
          <Link href="/classes?subject=math" className="comp-tab">
            수리 사고력 · 개념 연결
          </Link>
          <Link href="/classes?subject=english" className="comp-tab">
            영어 원서 리딩 · 토론
          </Link>
          <Link href="/classes?level=beginner" className="comp-tab">
            소그룹 밀착 피드백
          </Link>
        </div>
        <div className="course-grid">
          {demoOfferings.slice(0, 6).map((o) => (
            <OfferingCard key={o.id} offering={o} />
          ))}
        </div>
        <p className="caption">
          {demo
            ? "화면 이해를 위한 가상 수업입니다. 실제 모집 중인 수업이 아닙니다."
            : demoOfferings.length
              ? "학원에서 공개한 수업입니다. 결제·수강 신청 연동은 준비 중입니다."
              : "아직 공개된 수업이 없습니다. 학원 등록과 인증 서비스 연결을 준비하고 있습니다."}
        </p>
      </section>

      {/* Stitch 3-Pillar Trust & Quality Assurance Section */}
      <section className="steps-section">
        <div className="container">
          <div className="trust-header">
            <span className="eyebrow">EDUON 3대 안심 수강 기준</span>
            <h2>좋은 배움의 시작은, 믿을 수 있고 어렵지 않게</h2>
            <p className="muted">
              학생과 학부모님이 안심하고 수업에만 집중할 수 있도록 3가지 핵심
              원칙을 지킵니다.
            </p>
          </div>
          <div className="steps-grid">
            {[
              {
                icon: ShieldCheck,
                badge: "안심 검증 01",
                title: "검증된 학원 · 투명한 커리큘럼",
                text: "과목별 학습 목표, 회차별 커리큘럼, 수업료와 잔여석을 숨김없이 투명하게 공개합니다.",
              },
              {
                icon: Video,
                badge: "원클릭 교실 02",
                title: "설치 없이 바로 열리는 웹 라이브 강의실",
                text: "복잡한 외부 프로그램 설정 없이 EDUON 웹페이지 안에서 즉시 Zoom 실시간 화상 수업에 입장합니다.",
              },
              {
                icon: Users,
                badge: "밀착 관리 03",
                title: "출결 · 과제 · 강사 피드백을 한곳에서",
                text: "수업이 끝난 뒤에도 출석 기록과 강사님의 세심한 학습 피드백을 학부모님과 학생이 함께 확인합니다.",
              },
            ].map((s, i) => (
              <div className="step" key={s.title}>
                <div className="step-top-row">
                  <span className="step-icon-wrap">
                    <s.icon size={22} />
                  </span>
                  <span className="step-no">{s.badge || `0${i + 1}`}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stitch Partner Academy CTA */}
      <section className="container section">
        <div className="academy-cta">
          <div className="academy-cta-copy">
            <span className="academy-cta-pill">PARTNER ACADEMY NETWORK</span>
            <h2>
              좋은 가르침이,
              <br />더 많은 아이를 만날 수 있도록
            </h2>
            <p>
              온라인 실시간 수업 개설부터 Zoom 웹 강의실 연동, 출결·수강생
              관리까지.
              <br />
              학원의 다음 걸음을 EDUON 배움이음터가 함께 준비합니다.
            </p>
            <Link href="/teach" className="button academy-cta-btn">
              학원 입점 알아보기
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="cta-illustration" aria-hidden="true">
            <div className="cta-illustration-card">
              <BookOpen size={44} strokeWidth={1.5} />
              <strong>EduMarket Academy Cloud</strong>
              <span>
                지역 학원의 깊이 있는 수업을
                <br />
                전국 어디서나 열리는 온라인 교실로 연결합니다
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
