import type { PublicOffering } from "@/contracts/domain";
import { academies, gradeLabel, levelLabel } from "@/demo/catalog";

export interface NaturalQueryAnalysis {
  raw: string;
  tokens: string[];
  detectedSubjects: string[];
  detectedGrades: number[];
  detectedLevel: "beginner" | "intermediate" | "advanced" | null;
  detectedRegions: string[];
  maxPriceWon: number | null;
  summaryBadges: string[];
}

const REGION_KEYWORDS = [
  "수성구",
  "범어동",
  "범어",
  "만촌동",
  "만촌",
  "신매동",
  "신매",
  "시지",
  "동구",
  "율하동",
  "율하",
  "각산동",
  "각산",
  "신서동",
  "신서",
  "혁신도시",
  "혁신",
  "봉무동",
  "봉무",
  "이시아폴리스",
  "이시아",
  "신천동",
  "신천",
  "동대구",
  "달서구",
];

const STOPWORDS = new Set([
  "수업",
  "학원",
  "강좌",
  "강의",
  "찾아줘",
  "추천",
  "추천해줘",
  "알려줘",
  "있는",
  "에서",
  "으로",
  "하고",
  "싶어",
  "싶어요",
  "근처",
  "주변",
  "대구",
  "온라인",
  "실시간",
  "화상",
  "라이브",
]);

export function analyzeNaturalQuery(rawQuery: string): NaturalQueryAnalysis {
  const raw = rawQuery.trim();
  if (!raw) {
    return {
      raw: "",
      tokens: [],
      detectedSubjects: [],
      detectedGrades: [],
      detectedLevel: null,
      detectedRegions: [],
      maxPriceWon: null,
      summaryBadges: [],
    };
  }

  const normalized = raw.toLowerCase();
  const summaryBadges: string[] = [];

  // 1. Detect subject intent (수학, 영어, 국어, 미술)
  const detectedSubjects: string[] = [];
  if (/(수학|수리|연산|방정식|함수|기하|미적분|사고력)/.test(normalized)) {
    detectedSubjects.push("수학");
  }
  if (/(영어|어학원|리딩|스피킹|파닉스|문법|구문|독해|영작|회화|원서)/.test(normalized)) {
    detectedSubjects.push("영어");
  }
  if (/(국어|문해|논술|독서|비문학|문학|언매|화작|글쓰기)/.test(normalized)) {
    detectedSubjects.push("국어");
  }
  if (/(미술|아트|드로잉|수채화|디자인|회화|포트폴리오|미대|예고|일러스트)/.test(normalized)) {
    detectedSubjects.push("미술");
  }
  for (const subj of detectedSubjects) {
    summaryBadges.push(`과목: ${subj}`);
  }

  // 2. Detect grade intent (초등 1~6, 중등 7~9, 고등 10~12)
  const detectedGrades = new Set<number>();
  const elemMatch = normalized.match(/초(?:등)?\s*([1-6])/);
  const midMatch = normalized.match(/중(?:등|학)?\s*([1-3])/);
  const highMatch = normalized.match(/고(?:등|교)?\s*([1-3])/);

  if (elemMatch) {
    const g = Number(elemMatch[1]);
    detectedGrades.add(g);
    summaryBadges.push(`초등 ${g}학년`);
  } else if (/초등|초학생|초등부/.test(normalized)) {
    [1, 2, 3, 4, 5, 6].forEach((g) => detectedGrades.add(g));
    summaryBadges.push("초등부");
  }

  if (midMatch) {
    const g = Number(midMatch[1]);
    detectedGrades.add(g + 6);
    summaryBadges.push(`중등 ${g}학년`);
  } else if (/중등|중학|중학생|중등부/.test(normalized)) {
    [7, 8, 9].forEach((g) => detectedGrades.add(g));
    summaryBadges.push("중등부");
  }

  if (highMatch) {
    const g = Number(highMatch[1]);
    detectedGrades.add(g + 9);
    summaryBadges.push(`고등 ${g}학년`);
  } else if (/고등|고교|고등부|수능|미대|입시/.test(normalized)) {
    [10, 11, 12].forEach((g) => detectedGrades.add(g));
    summaryBadges.push("고등·입시");
  }

  // 3. Detect level intent
  let detectedLevel: "beginner" | "intermediate" | "advanced" | null = null;
  if (/(심화|고난도|1등급|변별력|최상위|킬러)/.test(normalized)) {
    detectedLevel = "advanced";
    summaryBadges.push("수준: 심화");
  } else if (/(기초|입문|초급|기본기|첫걸음)/.test(normalized)) {
    detectedLevel = "beginner";
    summaryBadges.push("수준: 기초");
  } else if (/(응용|중급|실전)/.test(normalized)) {
    detectedLevel = "intermediate";
    summaryBadges.push("수준: 기본·응용");
  }

  // 4. Detect region keywords
  const detectedRegions: string[] = [];
  for (const reg of REGION_KEYWORDS) {
    if (normalized.includes(reg)) {
      detectedRegions.push(reg);
    }
  }
  if (detectedRegions.length > 0) {
    summaryBadges.push(`지역: ${detectedRegions.slice(0, 2).join("·")}`);
  }

  // 5. Detect price constraint (e.g., "15만원", "140000원")
  let maxPriceWon: number | null = null;
  const manwonMatch = normalized.match(/(\d+)\s*만\s*원/);
  const wonMatch = normalized.match(/(\d{5,7})\s*원/);
  if (manwonMatch) {
    maxPriceWon = Number(manwonMatch[1]) * 10000;
    summaryBadges.push(`예산: ${Number(manwonMatch[1])}만원 이하`);
  } else if (wonMatch) {
    maxPriceWon = Number(wonMatch[1]);
    summaryBadges.push(`예산: ${maxPriceWon.toLocaleString("ko-KR")}원 이하`);
  }

  // 6. Remaining tokens for general search
  const rawTokens = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  return {
    raw,
    tokens: rawTokens,
    detectedSubjects,
    detectedGrades: Array.from(detectedGrades),
    detectedLevel,
    detectedRegions,
    maxPriceWon,
    summaryBadges,
  };
}

export function getOfferingCategoryLabel(o: PublicOffering): "수학" | "영어" | "국어" | "미술" {
  if (o.title.includes("[국어]")) return "국어";
  if (o.title.includes("[미술]")) return "미술";
  return o.subject === "math" ? "수학" : "영어";
}

export function filterOfferingsByNaturalLanguage(
  items: PublicOffering[],
  rawQuery: string,
): PublicOffering[] {
  const analysis = analyzeNaturalQuery(rawQuery);
  if (!analysis.raw) return items;

  const scored: Array<{ item: PublicOffering; score: number }> = [];

  for (const item of items) {
    const academyName =
      item.academyName ||
      academies.find((a) => a.id === item.academyId)?.name ||
      "";
    const academyRegion =
      item.academyRegion ||
      academies.find((a) => a.id === item.academyId)?.area ||
      "";
    const category = getOfferingCategoryLabel(item);
    const searchableText = [
      item.title,
      academyName,
      academyRegion,
      category,
      gradeLabel(item.gradeMin),
      gradeLabel(item.gradeMax),
      levelLabel[item.level],
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;

    // Price constraint check
    if (analysis.maxPriceWon !== null) {
      if (item.priceWon > analysis.maxPriceWon) continue;
      score += 20;
    }

    // Subject constraint check
    if (analysis.detectedSubjects.length > 0) {
      const subjectMatched = analysis.detectedSubjects.some(
        (subj) =>
          category === subj || searchableText.includes(subj.toLowerCase()),
      );
      if (!subjectMatched) continue;
      score += 40;
    }

    // Region constraint check
    if (analysis.detectedRegions.length > 0) {
      const regionMatched = analysis.detectedRegions.some((reg) =>
        searchableText.includes(reg),
      );
      if (!regionMatched) continue;
      score += 45;
    }

    // Grade overlap check
    if (analysis.detectedGrades.length > 0) {
      const gradeMatched = analysis.detectedGrades.some(
        (g) => g >= item.gradeMin && g <= item.gradeMax,
      );
      if (gradeMatched) {
        score += 30;
      } else {
        continue;
      }
    }

    // Level check
    if (analysis.detectedLevel) {
      if (item.level === analysis.detectedLevel) {
        score += 25;
      }
    }

    // General keyword token matching
    let matchedTokens = 0;
    for (const token of analysis.tokens) {
      if (searchableText.includes(token)) {
        matchedTokens++;
        score += 15;
      }
    }

    // If no structured intent was detected, require at least one token match
    const hasStructuredIntent =
      analysis.detectedSubjects.length > 0 ||
      analysis.detectedRegions.length > 0 ||
      analysis.detectedGrades.length > 0 ||
      analysis.detectedLevel !== null ||
      analysis.maxPriceWon !== null;

    if (!hasStructuredIntent && matchedTokens === 0) {
      continue;
    }

    if (score > 0 || matchedTokens > 0) {
      scored.push({ item, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.item.priceWon - b.item.priceWon)
    .map((entry) => entry.item);
}
