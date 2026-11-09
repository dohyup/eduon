import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const courses = [
  [
    "programming",
    "프로그래밍",
    "programming-1",
    "처음 시작하는 파이썬 프로그래밍",
  ],
  ["ai_usage", "AI 활용", "ai-usage-1", "일상과 업무에 바로 쓰는 AI 활용"],
  [
    "ai_certificate",
    "AI 자격증",
    "ai-certificate-1",
    "AI 자격증 준비를 위한 이론과 실습",
  ],
  ["ai_agent", "AI Agent 개발", "ai-agent-1", "나만의 AI Agent 개발 프로젝트"],
];
for (const width of [390, 1440])
  test(`${width}px 새 과목·일반인 검색과 상세 표시`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1000 });
    for (const [subject, label, id, title] of courses) {
      await page.goto("/classes");
      if (width < 768)
        await page.getByRole("button", { name: "검색 조건 열기" }).click();
      await page.getByLabel("과목", { exact: true }).selectOption(subject);
      await page
        .getByLabel("학년", { exact: true })
        .selectOption({ label: "일반인" });
      await page
        .getByRole("button", { name: "수업 검색", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`subject=${subject}&grade=13`));
      await expect(page.locator(".course-card")).toHaveCount(1);
      await expect(page.locator(".course-card")).toContainText(label);
      await expect(page.locator(".course-card")).toContainText("일반인");
      await page.locator(`a[href="/classes/${id}"]`).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator("main")).toContainText("일반인");
      await expect(page.locator("main")).not.toContainText("고4");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(
      a11y.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
  });
