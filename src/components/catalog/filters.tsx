"use client";
import { useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, Search } from "lucide-react";
export function Filters({ values }: { values: Record<string, string> }) {
  const [open, setOpen] = useState(false);
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
        <button className="button">
          <Search size={17} />
          수업 검색
        </button>
        <Link className="filter-reset" href="/classes">
          검색 조건 초기화
        </Link>
        <div className="filter-note">
          <span className="eyebrow">맞춤 탐색</span>
          <p>학년·수준·예산에 맞는 수업만 골라보세요.</p>
          <small>현재는 조건 기반 데모 검색입니다.</small>
        </div>
      </form>
    </>
  );
}
