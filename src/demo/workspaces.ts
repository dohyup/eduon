import { academies, demoOfferings, schedule } from "./catalog";

export type WorkspaceRole =
  "parent" | "student" | "owner" | "instructor" | "admin";
export const roleInfo = {
  parent: {
    name: "학부모",
    title: "아이의 배움을 한눈에",
    description: "다가오는 수업과 선생님의 피드백을 함께 확인하세요.",
    root: "/parent",
    nav: [
      ["학습 현황", "/parent"],
      ["자녀 관리", "/parent/children"],
      ["결제 내역", "/parent/orders"],
    ],
  },
  student: {
    name: "학생",
    title: "오늘도 한 걸음, 나의 배움",
    description: "수업을 준비하고, 배운 내용을 내 것으로 만들어 보세요.",
    root: "/learn",
    nav: [
      ["나의 배움", "/learn"],
      ["수업과 과제", "/learn/classes/math-1"],
    ],
  },
  owner: {
    name: "학원 원장",
    title: "차분하게 시작하는 오늘의 운영",
    description: "수업과 수강생, 처리할 일을 한곳에서 관리하세요.",
    root: "/academy",
    nav: [
      ["운영 현황", "/academy"],
      ["수업 관리", "/academy/classes"],
      ["수강생 관리", "/academy/students"],
      ["정산 내역", "/academy/finance"],
    ],
  },
  instructor: {
    name: "강사",
    title: "학생의 성장을 만드는 오늘",
    description: "수업 준비부터 출결과 피드백까지, 필요한 일에 집중하세요.",
    root: "/instructor",
    nav: [
      ["오늘의 수업", "/instructor"],
      ["출결과 피드백", "/instructor/classes/math-1"],
    ],
  },
  admin: {
    name: "운영자",
    title: "신뢰할 수 있는 배움의 연결",
    description: "입점 신청과 거래 현황을 확인하고 운영 이력을 관리하세요.",
    root: "/admin",
    nav: [
      ["운영 현황", "/admin"],
      ["학원 입점 심사", "/admin/academies"],
      ["거래 관리", "/admin/payments"],
    ],
  },
} as const;
const childProfiles = [
  {
    id: "child-1",
    offeringId: "math-1",
    name: "가상 학생 가람",
    grade: "초등 5학년",
    task: "분수의 덧셈, 풀이 과정을 설명해요",
    feedback:
      "풀이 과정을 차근차근 설명했어요. 다음 시간에는 다른 풀이도 함께 찾아볼게요.",
  },
  {
    id: "child-2",
    offeringId: "english-1",
    name: "가상 학생 나래",
    grade: "초등 4학년",
    task: "짧은 이야기 읽고 중심 문장 찾기",
    feedback:
      "글의 흐름을 잘 이해하고 있어요. 모르는 단어를 문맥에서 유추하는 연습을 이어가요.",
  },
];
export const demoChildren = childProfiles.map((child) => {
  const offering = demoOfferings.find((item) => item.id === child.offeringId)!;
  const academy = academies.find((item) => item.id === offering.academyId)!;
  return {
    ...child,
    title: offering.title,
    subject: offering.subject === "math" ? "수학" : "영어",
    teacher: academy.teacher,
    time: schedule(offering),
    academy: academy.name,
    priceWon: offering.priceWon,
    sessionCount: offering.sessions.length,
    day: new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      day: "numeric",
    })
      .format(new Date(offering.sessions[0].startsAt))
      .replace("일", ""),
  };
});
