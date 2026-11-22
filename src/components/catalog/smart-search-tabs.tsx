"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Sparkles,
  SlidersHorizontal,
  ArrowUpRight,
  CheckCircle2,
  X,
} from "lucide-react";
import type { PublicOffering } from "@/contracts/domain";
import { academies, gradeLabel, levelLabel, money } from "@/demo/catalog";
import {
  analyzeNaturalQuery,
  filterOfferingsByNaturalLanguage,
  getOfferingCategoryLabel,
} from "@/modules/catalog/natural-search";

const SAMPLE_PROMPTS = [
  "수성구 범어동 고등 수학 심화 내신",
  "동구 율하동 초등 영어 스피킹·리딩",
  "범어·신천 국어 비문학 문해력·독서논술",
  "만촌·이시아 창의·미대입시 미술학원",
  "혁신도시 중등 사고력 수학 서술형",
  "시지 신매동 초·중등 소수정예 영어수학",
];

export function SmartSearchTabs({
  offerings,
}: {
  offerings: PublicOffering[];
}) {
  const [activeTab, setActiveTab] = useState<"natural" | "filter">("natural");
  const [query, setQuery] = useState("");

  const analysis = useMemo(() => analyzeNaturalQuery(query), [query]);
  const matchedOfferings = useMemo(() => {
    if (!query.trim()) return [];
    return filterOfferingsByNaturalLanguage(offerings, query);
  }, [offerings, query]);

  return (
    <section
      className="smart-filter-section container"
      aria-label="맞춤 수업 찾기"
    >
      <div className="smart-filter-card">
        <div className="smart-filter-head">
          <div>
            <span className="smart-filter-badge">
              {activeTab === "natural" ? (
                <>
                  <Sparkles size={13} />
                  AI 자연어 맞춤 검색
                </>
              ) : (
                <>
                  <SlidersHorizontal size={13} />
                  3초 맞춤 스마트 필터
                </>
              )}
            </span>
            <h2>헤매지 않고 우리 아이에게 딱 맞는 학원 수업 바로 찾기</h2>
            <p className="muted">
              {activeTab === "natural"
                ? "찾고 싶은 동네, 학년, 과목, 학습 목표를 평소 말하듯 자연어로 입력하면 조건에 맞는 학원 수업을 즉시 찾아드립니다."
                : "과목·학년·수준을 단계별로 선택하면 조건에 맞는 검증된 실시간 학원 수업을 즉시 비교할 수 있습니다."}
            </p>
          </div>

          {/* 2-Mode Tab Switcher */}
          <div
            className="smart-mode-tabs"
            role="tablist"
            aria-label="맞춤 수업 찾기 방식 선택"
          >
            <button
              type="button"
              role="tab"
              id="tab-natural-search"
              aria-selected={activeTab === "natural"}
              aria-controls="panel-natural-search"
              className={`smart-mode-tab ${activeTab === "natural" ? "active" : ""}`}
              onClick={() => setActiveTab("natural")}
            >
              <Sparkles size={15} />
              1. 자연어 맞춤 검색
            </button>
            <button
              type="button"
              role="tab"
              id="tab-smart-filter"
              aria-selected={activeTab === "filter"}
              aria-controls="panel-smart-filter"
              className={`smart-mode-tab ${activeTab === "filter" ? "active" : ""}`}
              onClick={() => setActiveTab("filter")}
            >
              <SlidersHorizontal size={15} />
              2. 스마트 필터
            </button>
          </div>
        </div>

        {/* Tab 1: Natural Language Search */}
        {activeTab === "natural" ? (
          <div
            id="panel-natural-search"
            role="tabpanel"
            aria-labelledby="tab-natural-search"
            className="natural-search-panel"
          >
            <form action="/classes" className="natural-search-form">
              <div className="natural-input-wrap">
                <Search
                  size={19}
                  className="natural-search-icon"
                  aria-hidden="true"
                />
                <input
                  id="home-natural-q"
                  name="q"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="예: 수성구 범어동 고등 수학 심화, 동구 율하동 초등 영어 스피킹, 만촌동 입시 미술..."
                  aria-label="자연어 수업 검색어 입력"
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    className="natural-clear-btn"
                    aria-label="검색어 지우기"
                    onClick={() => setQuery("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <button type="submit" className="button natural-submit-btn">
                <Search size={17} />
                맞춤 수업 검색
              </button>
            </form>

            {/* Sample Natural Language Prompts */}
            <div className="natural-sample-row">
              <span className="natural-sample-label">추천 자연어 검색:</span>
              <div className="smart-quick-tags">
                {SAMPLE_PROMPTS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    className={`smart-chip ${query === sample ? "active" : ""}`}
                    onClick={() => setQuery(sample)}
                  >
                    &ldquo;{sample}&rdquo;
                  </button>
                ))}
              </div>
            </div>

            {/* Instant Live Matching Preview */}
            {query.trim() && (
              <div
                className="natural-live-results"
                aria-live="polite"
                aria-label="자연어 실시간 검색 결과"
              >
                <div className="natural-results-head">
                  <div className="natural-intent-badges">
                    <strong>
                      총 <span>{matchedOfferings.length}</span>개 맞춤 수업 발견
                    </strong>
                    {analysis.summaryBadges.map((badge) => (
                      <span key={badge} className="intent-pill">
                        {badge}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/classes?q=${encodeURIComponent(query.trim())}`}
                    className="text-link"
                  >
                    검색 결과 페이지에서 전체 보기
                    <ArrowUpRight size={15} />
                  </Link>
                </div>

                {matchedOfferings.length > 0 ? (
                  <div className="natural-preview-grid">
                    {matchedOfferings.slice(0, 6).map((o) => {
                      const academyName =
                        o.academyName ||
                        academies.find((ac) => ac.id === o.academyId)?.name ||
                        "인증 학원";
                      const academyRegion =
                        o.academyRegion ||
                        academies.find((ac) => ac.id === o.academyId)?.area ||
                        "대구";
                      const category = getOfferingCategoryLabel(o);
                      return (
                        <Link
                          key={o.id}
                          href={`/classes/${o.id}`}
                          className="natural-preview-item"
                        >
                          <div className="natural-preview-top">
                            <span className="natural-cat-badge">{category}</span>
                            <span className="natural-academy">
                              <CheckCircle2 size={13} />
                              {academyName}
                            </span>
                            <span className="natural-region">
                              {academyRegion}
                            </span>
                          </div>
                          <h3>{o.title}</h3>
                          <div className="natural-preview-meta">
                            <span>
                              {gradeLabel(o.gradeMin)}–{gradeLabel(o.gradeMax)} ·{" "}
                              {levelLabel[o.level]} · 잔여 {o.availableSeats}석
                            </span>
                            <strong>{money(o.priceWon)}</strong>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="natural-empty-box">
                    <p>
                      입력하신 <strong>&ldquo;{query}&rdquo;</strong> 조건과
                      정확히 일치하는 수업을 찾지 못했습니다. 지역명(예: 수성구,
                      범어동, 동구, 율하동)이나 과목명(수학, 영어, 국어,
                      미술)으로 검색해 보세요.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Tab 2: 3-Step Smart Filter */
          <div
            id="panel-smart-filter"
            role="tabpanel"
            aria-labelledby="tab-smart-filter"
          >
            <div className="natural-sample-row">
              <span className="natural-sample-label">빠른 태그 탐색:</span>
              <div className="smart-quick-tags" aria-label="빠른 조건 탐색">
                <Link href="/classes?subject=math" className="smart-chip active">
                  #초·중·고 수학 개념·심화
                </Link>
                <Link href="/classes?subject=english" className="smart-chip">
                  #원서 리딩·영어 내신
                </Link>
                <Link
                  href={`/classes?q=${encodeURIComponent("국어")}`}
                  className="smart-chip"
                >
                  #국어 문해력·독서논술
                </Link>
                <Link
                  href={`/classes?q=${encodeURIComponent("미술")}`}
                  className="smart-chip"
                >
                  #창의·입시 미술 실기
                </Link>
                <Link href="/classes?level=beginner" className="smart-chip">
                  #기초 탄탄 소그룹
                </Link>
              </div>
            </div>

            <form action="/classes" className="smart-filter-form">
              <div className="smart-step-box">
                <label htmlFor="home-subject">
                  <span className="step-num">1</span> 과목 선택
                </label>
                <select id="home-subject" name="subject" defaultValue="">
                  <option value="">전체 과목 (수학 · 영어 · 국어 · 미술)</option>
                  <option value="math">수학 · 국어 (개념·문해·심화)</option>
                  <option value="english">영어 · 미술 (리딩·스피킹·실기)</option>
                </select>
              </div>
              <div className="smart-step-box">
                <label htmlFor="home-grade">
                  <span className="step-num">2</span> 수강 대상 (학년)
                </label>
                <select id="home-grade" name="grade" defaultValue="">
                  <option value="">전체 학년 (초등~고등)</option>
                  <option value="4">초등 4학년</option>
                  <option value="5">초등 5학년</option>
                  <option value="6">초등 6학년</option>
                  <option value="7">중등 1학년</option>
                  <option value="8">중등 2학년</option>
                  <option value="9">중등 3학년</option>
                  <option value="10">고등 1학년</option>
                  <option value="11">고등 2학년</option>
                  <option value="12">고등 3학년</option>
                </select>
              </div>
              <div className="smart-step-box">
                <label htmlFor="home-level">
                  <span className="step-num">3</span> 학습 집중 수준
                </label>
                <select id="home-level" name="level" defaultValue="">
                  <option value="">전체 수준</option>
                  <option value="beginner">기초 다지기</option>
                  <option value="intermediate">기본 · 응용 확장</option>
                  <option value="advanced">심화 · 서술형 완성</option>
                </select>
              </div>
              <div className="smart-filter-submit">
                <button type="submit" className="button smart-submit-btn">
                  <Search size={17} />
                  맞춤 수업 찾기
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
