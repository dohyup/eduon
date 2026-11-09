import "server-only";
import { z } from "zod";
import type { LlmPort } from "@/integrations/llm/port";
import type { Recommendation } from "./rank";
let windowId = -1,
  calls = 0;
/** Optional fact selection only; free-form model claims never enter the UI. */
export async function explainRecommendations(
  items: Recommendation[],
  llm?: LlmPort,
): Promise<Recommendation[]> {
  if (!llm || !items.length || items.length > 5) return items;
  const minute = Math.floor(Date.now() / 60000);
  if (windowId !== minute) {
    windowId = minute;
    calls = 0;
  }
  if (calls >= 20) return items;
  calls++;
  const candidates = items.map(({ offering: o, reasons }) => ({
    id: o.id,
    publicFacts: {
      subject: o.subject,
      gradeMin: o.gradeMin,
      gradeMax: o.gradeMax,
      level: o.level,
      priceWon: o.priceWon,
      availableSeats: o.availableSeats,
      allowedReasons: [
        ...reasons,
        `수강료 ${o.priceWon}원`,
        `대상 학년 ${o.gradeMin}~${o.gradeMax}학년`,
      ],
    },
  }));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Error("EXPLANATION_TIMEOUT"));
      }, 3000);
    });
    const raw = await Promise.race([
      llm.explain({ candidates }, { signal: controller.signal }),
      timeout,
    ]);
    const result = z
      .array(
        z
          .object({
            id: z.string(),
            reasons: z.array(z.string().max(120)).min(1).max(10),
          })
          .strict(),
      )
      .max(5)
      .parse(raw);
    if (
      new Set(result.map((r) => r.id)).size !== result.length ||
      result.some((r) => !candidates.some((c) => c.id === r.id))
    )
      return items;
    if (
      result.some((r) =>
        r.reasons.some(
          (reason) =>
            !candidates
              .find((c) => c.id === r.id)!
              .publicFacts.allowedReasons.includes(reason),
        ),
      )
    )
      return items;
    return items.map((item) => {
      const extra =
        result.find((r) => r.id === item.offering.id)?.reasons || [];
      return { ...item, reasons: [...new Set([...item.reasons, ...extra])] };
    });
  } catch {
    return items;
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
