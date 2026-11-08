import { describe, expect, it } from "vitest";
import { demoOfferings } from "../../src/demo/catalog";
import { rankOfferings } from "../../src/modules/recommendations/rank";

describe("조건 추천", () => {
  it("예산 밖 후보와 매진 후보를 제외한다", () => {
    expect(rankOfferings(demoOfferings, { maxPriceWon: 1 })).toEqual([]);
    expect(
      rankOfferings([{ ...demoOfferings[0], availableSeats: 0 }], {}),
    ).toEqual([]);
  });
  it("모든 회차가 가능한 시간창의 합집합 안에 있어야 한다", () => {
    const item = {
      ...demoOfferings[0],
      sessions: [
        {
          id: "s",
          startsAt: "2030-01-01T01:00:00Z",
          endsAt: "2030-01-01T02:00:00Z",
        },
      ],
    };
    expect(
      rankOfferings([item], {
        availableWindows: [
          { startsAt: "2030-01-01T01:00:00Z", endsAt: "2030-01-01T01:30:00Z" },
          { startsAt: "2030-01-01T01:30:00Z", endsAt: "2030-01-01T02:00:00Z" },
        ],
      }),
    ).toHaveLength(1);
    expect(
      rankOfferings([item], {
        availableWindows: [
          { startsAt: "2030-01-01T01:00:00Z", endsAt: "2030-01-01T01:59:00Z" },
        ],
      }),
    ).toEqual([]);
  });
  it("잘못된 학년과 불가능한 시간창은 후보를 만들지 않는다", () => {
    expect(rankOfferings(demoOfferings, { grade: Number.NaN })).toEqual([]);
    expect(
      rankOfferings(demoOfferings, {
        availableWindows: [{ startsAt: "bad", endsAt: "2030-01-01T02:00:00Z" }],
      }),
    ).toEqual([]);
    expect(
      rankOfferings(demoOfferings, {
        availableWindows: [
          { startsAt: "2030-01-01T02:00:00Z", endsAt: "2030-01-01T01:00:00Z" },
        ],
      }),
    ).toEqual([]);
  });
  it("조건에 맞는 신규 수업을 안정적으로 정렬하고 다섯 개만 반환한다", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      ...demoOfferings[0],
      id: `offering-${6 - i}`,
    }));
    const result = rankOfferings(items, {
      subject: "math",
      grade: 4,
      level: "beginner",
      maxPriceWon: 150000,
    });
    expect(result.map((r) => r.offering.id)).toEqual([
      "offering-0",
      "offering-1",
      "offering-2",
      "offering-3",
      "offering-4",
    ]);
    expect(result[0].reasons).toEqual(
      expect.arrayContaining([
        "과목 일치",
        "학년 범위 일치",
        "수준 일치",
        "예산 이내",
      ]),
    );
    expect(result[0].ruleVersion).toBe("rules-v1");
    expect(items[0].id).toBe("offering-6");
  });
  it("달력에 없는 날짜를 가능한 시간으로 정규화하지 않는다", () => {
    const item = {
      ...demoOfferings[0],
      sessions: [
        {
          id: "s",
          startsAt: "2030-03-02T01:00:00Z",
          endsAt: "2030-03-02T02:00:00Z",
        },
      ],
    };
    expect(
      rankOfferings([item], {
        availableWindows: [
          { startsAt: "2030-02-30T00:00:00Z", endsAt: "2030-03-03T00:00:00Z" },
        ],
      }),
    ).toEqual([]);
  });
});
