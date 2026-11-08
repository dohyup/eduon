import type { PublicOffering } from "../contracts/domain";
export const academies = [
  {
    id: "academy-1",
    name: "이음수학 배움교실",
    area: "대구 수성구",
    intro: "개념을 이해하고, 자신의 언어로 설명하는 힘을 기릅니다.",
    teacher: "이음 선생님",
  },
  {
    id: "academy-2",
    name: "온빛영어 배움교실",
    area: "대구 달서구",
    intro: "읽고, 말하고, 생각하며 영어를 일상에 연결합니다.",
    teacher: "온빛 선생님",
  },
];
const entries: [
  string,
  string,
  "math" | "english",
  number,
  number,
  "beginner" | "intermediate" | "advanced",
  number,
  number,
][] = [
  [
    "math-1",
    "생각하는 힘을 키우는 개념 수학",
    "math",
    4,
    6,
    "beginner",
    120000,
    3,
  ],
  [
    "english-1",
    "이야기로 시작하는 영어 리딩",
    "english",
    3,
    5,
    "beginner",
    100000,
    4,
  ],
  [
    "math-2",
    "중학 수학, 원리부터 탄탄하게",
    "math",
    7,
    8,
    "intermediate",
    140000,
    2,
  ],
  [
    "english-2",
    "내 생각을 말하는 영어 스피킹",
    "english",
    6,
    8,
    "intermediate",
    130000,
    3,
  ],
  [
    "math-3",
    "문제 해결력을 기르는 심화 수학",
    "math",
    9,
    10,
    "advanced",
    160000,
    2,
  ],
  [
    "english-3",
    "지문을 읽는 힘, 고등 영어 독해",
    "english",
    10,
    12,
    "advanced",
    150000,
    5,
  ],
];
export const demoOfferings: PublicOffering[] = entries.map(
  (
    [id, title, subject, gradeMin, gradeMax, level, priceWon, availableSeats],
    i,
  ) => ({
    id,
    title,
    subject,
    gradeMin,
    gradeMax,
    level,
    priceWon,
    availableSeats,
    academyId: subject === "math" ? "academy-1" : "academy-2",
    sessions: Array.from({ length: 4 }, (_, week) => ({
      id: `session-${id}-${week + 1}`,
      startsAt: new Date(Date.UTC(2030, 0, i + 1 + week * 7, 8)).toISOString(),
      endsAt: new Date(
        Date.UTC(2030, 0, i + 1 + week * 7, 8, 50),
      ).toISOString(),
    })),
  }),
);
export const gradeLabel = (g: number) =>
  g <= 6 ? `초${g}` : g <= 9 ? `중${g - 6}` : `고${g - 9}`;
export const levelLabel = {
  beginner: "기초",
  intermediate: "기본·응용",
  advanced: "심화",
};
export const money = (n: number) =>
  new Intl.NumberFormat("ko-KR").format(n) + "원";
export const schedule = (o: PublicOffering) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(o.sessions[0].startsAt));
