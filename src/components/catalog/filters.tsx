"use client";
import { useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, Search, Sparkles } from "lucide-react";

export function Filters({ values }: { values: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"filter" | "natural">(
    values.q && !values.subject && !values.grade && !values.level
      ? "natural"
      : "filter",
  );

  return (
    <>
      <button
        className="button secondary filter-toggle"
        aria-expanded={open}
        aria-controls="search-filter"
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal size={17} />
        검색 조건 {open ? "접기" : "열기"}
      </button>
      <form
        id="search-filter"
        action="/classes"
        className={`filter-panel ${open ? "is-open" : ""}`}
      >
        <div className="filter-title">
          <SlidersHorizontal size={18} />
          <h2>나에게 맞는 수업</h2>
        </div>

        <div
          className="filter-mode-tabs"
          role="tablist"
          aria-label="검색 방식 선택"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "natural"}
            className={`filter-mode-tab ${tab === "natural" ? "active" : ""}`}
            onClick={() => setTab("natural")}
          >
            <Sparkles size={13} />
            자연어 검색
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "filter"}
            className={`filter-mode-tab ${tab === "filter" ? "active" : ""}`}
            onClick={() => setTab("filter")}
          >
            <SlidersHorizontal size={13} />
            스마트 필터
          </button>
        </div>

        <div className="filter-field">
          <label htmlFor="q">자연어 키워드 검색</label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="예: 수성구 고등 수학, 율하 영어..."
            defaultValue={values.q || ""}
          />
        </div>

        <div
          className="filter-smart-fields"
          style={tab === "natural" ? { opacity: 0.92 } : undefined}
        >
          <div className="filter-field">
            <label htmlFor="subject">과목</label>
            <select
              id="subject"
              name="subject"
              defaultValue={values.subject || ""}
            >
              <option value="">전체 과목</option>
              <option value="math">수학</option>
              <option value="english">영어</option>
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="grade">학년</label>
            <select id="grade" name="grade" defaultValue={values.grade || ""}>
              <option value="">전체 학년</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i < 6
                    ? `초등 ${i + 1}학년`
                    : i < 9
                      ? `중등 ${i - 5}학년`
                      : `고등 ${i - 8}학년`}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="level">학습 수준</label>
            <select id="level" name="level" defaultValue={values.level || ""}>
              <option value="">전체 수준</option>
              <option value="beginner">기초</option>
              <option value="intermediate">기본·응용</option>
              <option value="advanced">심화</option>
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="max-price">최대 수강료</label>
            <input
              id="max-price"
              name="maxPriceWon"
              type="number"
              min="0"
              step="1"
              placeholder="금액 입력 (원)"
              defaultValue={values.maxPriceWon || ""}
            />
          </div>
        </div>

        <button className="button">
          <Search size={17} />
          수업 검색
        </button>
        <Link className="filter-reset" href="/classes">
          검색 조건 초기화
        </Link>
        <div className="filter-note">
          <span className="eyebrow">맞춤 탐색</span>
          <p>자연어 문장 또는 학년·수준·예산 조건으로 수업을 찾아보세요.</p>
          <small>대구 수성구·동구 학원 및 실시간 수업 검색 지원</small>
        </div>
      </form>
    </>
  );
}
