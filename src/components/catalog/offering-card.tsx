import Link from "next/link";
import { ArrowUpRight, Clock3, Video, Users } from "lucide-react";
import type { PublicOffering } from "@/contracts/domain";
import { academies, levelLabel, money } from "@/demo/catalog";
import { subjectLabels, gradeRangeLabel } from "@/contracts/catalog";
export function OfferingCard({ offering: o }: { offering: PublicOffering }) {
  const a = {
    name:
      o.academyName ||
      academies.find((a) => a.id === o.academyId)?.name ||
      "학원",
    area:
      o.academyRegion ||
      academies.find((a) => a.id === o.academyId)?.area ||
      "온라인",
  };
  return (
    <article className="course-card">
      <div className={`course-art ${o.subject}`} aria-hidden="true">
        <div className="art-grid" />
        <span className="art-subject">{subjectLabels[o.subject]}</span>
        <span className="art-symbol">
          {o.subject === "math"
            ? "x² + y²"
            : o.subject === "english"
              ? "Aa"
              : o.subject === "programming"
                ? "{ }"
                : "AI"}
        </span>
        <span className="art-note">
          {o.subject === "math"
            ? "질문에서 시작하는 배움"
            : o.subject === "english"
              ? "세상을 읽는 새로운 언어"
              : "직접 만들며 익히는 디지털 역량"}
        </span>
        <span className="art-tag">
          <Video size={13} />
          실시간 온라인
        </span>
      </div>
      <div className="course-content">
        <div className="row">
          <span className={`badge ${o.subject === "math" ? "" : "green"}`}>
            {subjectLabels[o.subject]}
          </span>
          <span className="muted text-sm">
            {gradeRangeLabel(o.gradeMin, o.gradeMax)} · {levelLabel[o.level]}
          </span>
        </div>
        <h3>
          <Link href={`/classes/${o.id}`}>
            {o.title}
            <ArrowUpRight size={18} />
          </Link>
        </h3>
        <p className="text-sm muted">
          {a.name} · {a.area}
        </p>
        <div className="course-meta">
          <span>
            <Clock3 size={15} />
            50분 · 소그룹 수업
          </span>
          <span>
            <Users size={15} />
            잔여 {o.availableSeats}석
          </span>
        </div>
        <div className="course-price">
          <strong>{money(o.priceWon)}</strong>
          <span className="muted text-sm">{o.sessions.length}회 기준</span>
        </div>
      </div>
    </article>
  );
}
