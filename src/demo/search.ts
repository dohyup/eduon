import type { SearchInput, SearchResult } from "../contracts/domain";
import { MAX_GRADE } from "../contracts/catalog";
import { demoOfferings } from "./catalog";
export function searchDemoOfferings(input: SearchInput): SearchResult {
  if (
    input.grade !== undefined &&
    (!Number.isInteger(input.grade) ||
      input.grade < 1 ||
      input.grade > MAX_GRADE)
  )
    return { items: [], nextCursor: null };
  if (
    input.maxPriceWon !== undefined &&
    (!Number.isSafeInteger(input.maxPriceWon) || input.maxPriceWon < 0)
  )
    return { items: [], nextCursor: null };
  return {
    items: demoOfferings.filter(
      (o) =>
        (!input.subject || o.subject === input.subject) &&
        (input.grade === undefined ||
          (o.gradeMin <= input.grade && o.gradeMax >= input.grade)) &&
        (!input.level || o.level === input.level) &&
        (input.maxPriceWon === undefined || o.priceWon <= input.maxPriceWon) &&
        (!input.availableWindows?.length ||
          o.sessions.every((s) =>
            input.availableWindows!.some(
              (w) =>
                new Date(w.startsAt) <= new Date(s.startsAt) &&
                new Date(w.endsAt) >= new Date(s.endsAt),
            ),
          )),
    ),
    nextCursor: null,
  };
}
