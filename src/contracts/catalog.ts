export const SUBJECTS = [
  "math",
  "english",
  "programming",
  "ai_usage",
  "ai_certificate",
  "ai_agent",
] as const;
export const subjectLabels: Record<(typeof SUBJECTS)[number], string> = {
  math: "수학",
  english: "영어",
  programming: "프로그래밍",
  ai_usage: "AI 활용",
  ai_certificate: "AI 자격증",
  ai_agent: "AI Agent 개발",
};
/** 1~12 are school grades, 13 is a learner category, never proof of age or authority. */
export const GENERAL_GRADE = 13;
export const MAX_GRADE = GENERAL_GRADE;
export function gradeLabel(grade: number): string {
  if (grade === GENERAL_GRADE) return "일반인";
  return grade <= 6
    ? `초${grade}`
    : grade <= 9
      ? `중${grade - 6}`
      : `고${grade - 9}`;
}
export function gradeText(grade: number): string {
  if (grade === GENERAL_GRADE) return "일반인";
  return grade <= 6
    ? `초등 ${grade}학년`
    : grade <= 9
      ? `중등 ${grade - 6}학년`
      : `고등 ${grade - 9}학년`;
}
export function gradeRangeLabel(min: number, max: number): string {
  return min === max
    ? gradeLabel(min)
    : `${gradeLabel(min)}–${gradeLabel(max)}`;
}
