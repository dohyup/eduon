import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  Video,
  Users,
  CheckCircle2,
  Star,
} from "lucide-react";
import type { PublicOffering } from "@/contracts/domain";
import { academies, gradeLabel, levelLabel, money, schedule } from "@/demo/catalog";

export function OfferingCard({ offering: o }: { offering: PublicOffering }) {
  const a = {
    name:
      o.academyName ||
      academies.find((ac) => ac.id === o.academyId)?.name ||
      "인증 학원",
    area:
      o.academyRegion ||
      academies.find((ac) => ac.id === o.academyId)?.area ||
      "온라인 라이브",
  };
  const isKorean = o.title.includes("[국어]");
  const isArt = o.title.includes("[미술]");
  const subjectTitle = isKorean
    ? "초·중·고 국어"
    : isArt
      ? "초·중·고 미술"
      : o.subject === "math"
        ? "초·중·고 수학"
        : "초·중·고 영어";
  const subjectShort = isKorean
    ? "국어"
    : isArt
      ? "미술"
      : o.subject === "math"
        ? "수학"
        : "영어";
  const symbolText = isKorean
    ? "문해 · 논술"
    : isArt
      ? "Art & Design"
      : o.subject === "math"
        ? "f(x) = x² + y²"
        : "Reading & Flow";
  const rating = o.subject === "math" ? "4.9" : "4.8";
  const reviewCount = o.subject === "math" ? "142" : "98";
  const reviewKeywords = isKorean
    ? ["비문학·문학 핵심 분석", "서술형·독서논술 첨삭"]
    : isArt
      ? ["1:1 실기 크리틱 지도", "창의 포트폴리오 완성"]
      : o.subject === "math"
        ? ["질문 피드백 10분 내 답변", "개념·심화 밀착 지도"]
        : ["발화 중심 양방향 첨삭", "수준별 리딩 코칭"];

  return (
    <article className="course-card">
      <div className={`course-art ${o.subject}`} aria-hidden="true">
        <div className="art-grid" />
        <div className="art-top-badges">
          <span className="art-live-pill">
            <span className="art-live-dot" />
            <Video size={12} />
            {o.isZoomLive ? "Zoom 라이브" : "실시간 라이브"}
          </span>
          <span className="art-cap-pill">
            소수정예 · 잔여 {o.availableSeats}석
          </span>
        </div>
        <div className="art-center">
          <span className="art-subject">
            {subjectTitle} · {gradeLabel(o.gradeMin)}–{gradeLabel(o.gradeMax)}
          </span>
          <span className="art-symbol">{symbolText}</span>
        </div>
        <div className="art-bottom-bar">
          <span>{schedule(o)}</span>
          <span>회당 50분</span>
        </div>
      </div>
      <div className="course-content">
        <div className="course-academy-row">
          <span className="course-academy-name">
            <CheckCircle2 size={14} className="verified-icon" />
            {a.name}
          </span>
          <span className="verified-pill">인증학원</span>
          <span className="course-area">{a.area}</span>
        </div>
        <h3>
          <Link href={`/classes/${o.id}`}>
            <span>{o.title}</span>
            <ArrowUpRight size={18} />
          </Link>
        </h3>
        <div className="course-rating-row">
          <span className="badge-subject">
            {subjectShort} · {levelLabel[o.level]}
          </span>
          <span className="rating-pill" aria-label={`평점 ${rating}점`}>
            <Star size={13} fill="currentColor" />
            <strong>{rating}</strong>
            <span>({reviewCount})</span>
          </span>
        </div>
        <div className="course-review-chips">
          {reviewKeywords.map((kw) => (
            <span key={kw} className="review-chip">
              &ldquo;{kw}&rdquo;
            </span>
          ))}
        </div>
        <div className="course-meta">
          <span>
            <Clock3 size={14} />
            50분 · {o.sessions.length}회 과정
          </span>
          <span>
            <Users size={14} />
            잔여 {o.availableSeats}석
          </span>
        </div>
        <div className="course-price">
          <div className="price-stack">
            <small className="muted">{o.sessions.length}회 수강료</small>
            <strong>{money(o.priceWon)}</strong>
          </div>
          <Link className="course-cta-btn" href={`/classes/${o.id}`}>
            상세 보기
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}
