import type { PublicOffering, SearchInput } from "@/contracts/domain";
import { z } from "zod";

const instant = z.iso.datetime({ offset: true });

export const RULE_VERSION = "rules-v1";
export type Recommendation = {
  offering: PublicOffering;
  score: number;
  reasons: string[];
  ruleVersion: typeof RULE_VERSION;
};

export function validSearchInput(input: SearchInput): boolean {
  return (
    (input.subject === undefined ||
      ["math", "english"].includes(input.subject)) &&
    (input.level === undefined ||
      ["beginner", "intermediate", "advanced"].includes(input.level)) &&
    (input.grade === undefined ||
      (Number.isInteger(input.grade) &&
        input.grade >= 1 &&
        input.grade <= 12)) &&
    (input.maxPriceWon === undefined ||
      (Number.isSafeInteger(input.maxPriceWon) && input.maxPriceWon >= 0)) &&
    (input.availableWindows === undefined ||
      (Array.isArray(input.availableWindows) &&
        input.availableWindows.length <= 100 &&
        input.availableWindows.every(
          (w) =>
            w &&
            instant.safeParse(w.startsAt).success &&
            instant.safeParse(w.endsAt).success &&
            Date.parse(w.startsAt) < Date.parse(w.endsAt),
        )))
  );
}

export function matchesOffering(
  item: PublicOffering,
  input: SearchInput,
): boolean {
  if (
    !validSearchInput(input) ||
    item.availableSeats <= 0 ||
    !item.sessions.length
  )
    return false;
  if (input.subject && item.subject !== input.subject) return false;
  if (
    input.grade !== undefined &&
    (item.gradeMin > input.grade || item.gradeMax < input.grade)
  )
    return false;
  if (input.level && item.level !== input.level) return false;
  if (input.maxPriceWon !== undefined && item.priceWon > input.maxPriceWon)
    return false;
  const windows: [number, number][] = [];
  for (const window of [...(input.availableWindows ?? [])].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  )) {
    const start = Date.parse(window.startsAt),
      end = Date.parse(window.endsAt);
    const last = windows[windows.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else windows.push([start, end]);
  }
  return item.sessions.every((session) => {
    const start = Date.parse(session.startsAt),
      end = Date.parse(session.endsAt);
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start < end &&
      (!windows.length || windows.some((w) => w[0] <= start && w[1] >= end))
    );
  });
}

export function rankOfferings(
  items: PublicOffering[],
  input: SearchInput,
): Recommendation[] {
  return items
    .filter((item) => matchesOffering(item, input))
    .map((offering): Recommendation => {
      const reasons: string[] = ["잔여 좌석 있음"];
      let score = 0;
      if (input.availableWindows?.length) {
        reasons.push("모든 회차 시간 일치");
        score += 100;
      }
      if (input.maxPriceWon !== undefined) {
        reasons.push("예산 이내");
        score += 50;
      }
      if (input.subject) {
        reasons.push("과목 일치");
        score += 30;
      }
      if (input.grade !== undefined) {
        reasons.push("학년 범위 일치");
        score += 30;
      }
      if (input.level) {
        reasons.push("수준 일치");
        score += 20;
      }
      return { offering, score, reasons, ruleVersion: RULE_VERSION };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.offering.priceWon - b.offering.priceWon ||
        a.offering.id.localeCompare(b.offering.id),
    )
    .slice(0, 5);
}
