import Link from "next/link";
import { Filters } from "@/components/catalog/filters";
import { OfferingCard } from "@/components/catalog/offering-card";
import { listPublicOfferings } from "@/modules/catalog/public";
import { isDemoMode } from "@/server/config";
import type { SearchInput } from "@/contracts/domain";
import { Search, ArrowUpRight } from "lucide-react";
export const metadata = { title: "수업 찾기" };
export default async function Classes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const values = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || ""]),
  );
  const invalid =
    (values.subject && !["math", "english"].includes(values.subject)) ||
    (values.level &&
      !["beginner", "intermediate", "advanced"].includes(values.level)) ||
    (values.grade &&
      (!/^\d+$/.test(values.grade) ||
        Number(values.grade) < 1 ||
        Number(values.grade) > 12)) ||
    (values.maxPriceWon &&
      (!/^\d+$/.test(values.maxPriceWon) ||
        !Number.isSafeInteger(Number(values.maxPriceWon))));
  const input: SearchInput = {
    subject: (values.subject as SearchInput["subject"]) || undefined,
    grade: values.grade ? Number(values.grade) : undefined,
    level: (values.level as SearchInput["level"]) || undefined,
    maxPriceWon: values.maxPriceWon ? Number(values.maxPriceWon) : undefined,
  };
  const { items, unavailable, nextCursor } = invalid
    ? { items: [], unavailable: false, nextCursor: null }
    : await listPublicOfferings({
        ...input,
        cursor: values.cursor || undefined,
      });
  return (
    <main id="main-content" className="container page-content">
      <div className="page-heading">
        <span className="eyebrow">FIND YOUR CLASS</span>
        <h1>아이의 속도에 맞는 배움</h1>
        <p className="muted">
          과목과 수준, 일정을 살펴보고 우리 아이에게 맞는 수업을 찾아보세요.
        </p>
      </div>
      <div className="catalog-layout">
        <aside aria-label="검색 조건">
          <Filters values={values} />
        </aside>
        <section aria-label="수업 검색 결과">
          <div className="results-heading">
            <strong>
              전체 <span>{items.length}</span>개 수업
            </strong>
            <span className="muted text-sm">
              온라인 소그룹 {isDemoMode() ? "· 데모 수업" : ""}
            </span>
          </div>
          {unavailable && (
            <p className="error-note" role="status">
              수업 데이터 연결을 준비하고 있습니다. 가상 수업을 실제 모집
              수업으로 표시하지 않습니다.
            </p>
          )}
          {invalid && (
            <p className="error-note" role="alert">
              검색 조건을 확인해주세요. 학년은 1~12, 수강료는 0 이상의 정수로
              입력하세요.
            </p>
          )}
          {items.length ? (
            <div className="course-grid catalog-cards">
              {items.map((o) => (
                <OfferingCard key={o.id} offering={o} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={36} />
              <h2>조건에 맞는 수업이 없어요</h2>
              <p>
                학년이나 수강료 조건을 조금 넓혀보세요.
                <br />
                없는 수업을 만들어 추천하지 않습니다.
              </p>
              <Link href="/classes" className="button secondary">
                전체 수업 보기
                <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
          {nextCursor && (
            <Link
              className="button secondary"
              href={
                "/classes?" +
                new URLSearchParams({
                  ...values,
                  cursor: nextCursor,
                }).toString()
              }
            >
              다음 수업 보기
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
