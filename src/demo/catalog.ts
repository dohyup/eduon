import type { PublicOffering, Subject } from "../contracts/domain";
export { gradeLabel } from "../contracts/catalog";
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
  {
    id: "academy-3",
    name: "가상 디지털 배움교실",
    area: "온라인",
    intro: "프로그래밍부터 AI 활용과 Agent 개발까지, 실습으로 배웁니다.",
    teacher: "가상 디지털 선생님",
  },
];
const entries: [
  string,
  string,
  Subject,
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
  [
    "programming-1",
    "처음 시작하는 파이썬 프로그래밍",
    "programming",
    13,
    13,
    "beginner",
    120000,
    4,
  ],
  [
    "ai-usage-1",
    "일상과 업무에 바로 쓰는 AI 활용",
    "ai_usage",
    13,
    13,
    "beginner",
    100000,
    4,
  ],
  [
    "ai-certificate-1",
    "AI 자격증 준비를 위한 이론과 실습",
    "ai_certificate",
    13,
    13,
    "intermediate",
    140000,
    4,
  ],
  [
    "ai-agent-1",
    "나만의 AI Agent 개발 프로젝트",
    "ai_agent",
    13,
    13,
    "advanced",
    160000,
    4,
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
    academyId:
      subject === "math"
        ? "academy-1"
        : subject === "english"
          ? "academy-2"
          : "academy-3",
    sessions: Array.from({ length: 4 }, (_, week) => ({
      id: `session-${id}-${week + 1}`,
      startsAt: new Date(Date.UTC(2030, 0, i + 1 + week * 7, 8)).toISOString(),
      endsAt: new Date(
        Date.UTC(2030, 0, i + 1 + week * 7, 8, 50),
      ).toISOString(),
    })),
  }),
);
export const levelLabel = {
  beginner: "기초",
  intermediate: "기본·응용",
  advanced: "심화",
};
export const demoCurricula: Partial<Record<Subject, string[]>> = {
  programming: [
    "파이썬 변수와 자료형 익히기",
    "조건문과 반복문으로 문제 풀기",
    "함수와 파일 처리로 작업 자동화하기",
    "작은 프로그램을 만들고 개선하기",
  ],
  ai_usage: [
    "AI 도구의 특징과 결과 검증 익히기",
    "목적에 맞는 프롬프트 작성하기",
    "문서·자료 정리와 업무에 AI 적용하기",
    "개인정보를 지키는 활용 흐름 만들기",
  ],
  ai_certificate: [
    "AI·데이터·머신러닝 기초 정리하기",
    "생성형 AI의 원리와 활용 이해하기",
    "개념 문제와 실습으로 준비하기",
    "모의 평가와 오답으로 학습 점검하기",
  ],
  ai_agent: [
    "AI Agent의 구성과 도구 호출 이해하기",
    "외부 도구를 연결하는 Agent 만들기",
    "상태와 메모리를 활용한 작업 흐름 만들기",
    "평가와 권한 검사를 적용해 프로젝트 개선하기",
  ],
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
