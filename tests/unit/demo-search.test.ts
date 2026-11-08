import { describe, expect, it } from "vitest";
import { demoOfferings } from "../../src/demo/catalog";
import { searchDemoOfferings } from "../../src/demo/search";

describe("합성 수업 검색", () => {
  it("공개 요금에 맞는 네 회차의 일정이 제공된다", () => {
    for (const offering of demoOfferings) {
      expect(offering.sessions).toHaveLength(4);
      expect(new Set(offering.sessions.map((s) => s.id)).size).toBe(4);
      expect(
        offering.sessions.every(
          (s) =>
            Date.parse(s.endsAt) - Date.parse(s.startsAt) === 50 * 60 * 1000,
        ),
      ).toBe(true);
    }
  });
  it("초기 공급은 가상 학원 2곳의 수업 6개다", () => {
    expect(demoOfferings).toHaveLength(6);
    expect(new Set(demoOfferings.map((item) => item.academyId)).size).toBe(2);
    expect(searchDemoOfferings({}).items).toEqual(demoOfferings);
  });

  it.each(["math", "english"] as const)(
    "선택한 과목 %s만 찾는다",
    (subject) => {
      const { items } = searchDemoOfferings({ subject });
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.subject === subject)).toBe(true);
    },
  );

  it("예산을 넘는 수업을 노출하지 않는다", () => {
    expect(searchDemoOfferings({ maxPriceWon: 1 }).items).toEqual([]);
    const budget = demoOfferings[0].priceWon;
    const { items } = searchDemoOfferings({ maxPriceWon: budget });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.priceWon <= budget)).toBe(true);
  });

  it("학년 범위와 학습 수준을 함께 적용한다", () => {
    const target = demoOfferings[0];
    const { items } = searchDemoOfferings({
      grade: target.gradeMin,
      level: target.level,
    });
    expect(items.some((item) => item.id === target.id)).toBe(true);
    expect(
      items.every(
        (item) =>
          item.gradeMin <= target.gradeMin &&
          item.gradeMax >= target.gradeMin &&
          item.level === target.level,
      ),
    ).toBe(true);
  });

  it.each([0, 13, -1, 1.5, Number.NaN])(
    "잘못된 학년 %s는 결과를 만들지 않는다",
    (grade) => {
      expect(searchDemoOfferings({ grade }).items).toEqual([]);
    },
  );

  it.each([-1, 1.5, Number.NaN])(
    "잘못된 금액 %s는 결과를 만들지 않는다",
    (maxPriceWon) => {
      expect(searchDemoOfferings({ maxPriceWon }).items).toEqual([]);
    },
  );

  it("검색으로 원본 데이터를 변경하지 않는다", () => {
    const before = JSON.stringify(demoOfferings);
    searchDemoOfferings({ subject: "math", grade: 7, maxPriceWon: 100000 });
    expect(JSON.stringify(demoOfferings)).toBe(before);
    expect(searchDemoOfferings({}).nextCursor).toBeNull();
  });
});
