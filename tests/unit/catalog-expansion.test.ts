import { expect, it } from "vitest";
import { demoOfferings, gradeLabel } from "../../src/demo/catalog";
import { searchDemoOfferings } from "../../src/demo/search";
import {
  validSearchInput,
  rankOfferings,
} from "../../src/modules/recommendations/rank";
import type { Subject } from "../../src/contracts/domain";

it.each(["programming", "ai_usage", "ai_certificate", "ai_agent"])(
  "%s 일반인 수업을 검색하고 추천한다",
  (value) => {
    const subject = value as Subject;
    expect(validSearchInput({ subject, grade: 13 })).toBe(true);
    const result = searchDemoOfferings({ subject, grade: 13 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(
      result.items.every(
        (o) => o.subject === subject && o.gradeMin === 13 && o.gradeMax === 13,
      ),
    ).toBe(true);
    expect(rankOfferings(demoOfferings, { subject, grade: 13 })).toHaveLength(
      result.items.length,
    );
  },
);
it("일반인을 고4로 표시하지 않고 학교 학년 검색과 구분한다", () => {
  expect(gradeLabel(13)).toBe("일반인");
  expect(
    searchDemoOfferings({ grade: 12 }).items.every((o) => o.gradeMax <= 12),
  ).toBe(true);
  expect(validSearchInput({ grade: 14 })).toBe(false);
});
