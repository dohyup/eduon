import { test, expect } from "@playwright/test";

test("공개 홈에서 수업 탐색을 시작한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "우리 아이",
  );
  const findClass = page
    .getByRole("link", { name: "수업 찾기", exact: true })
    .first();
  await expect(findClass).toHaveAttribute("href", "/classes");
  await findClass.click();
  await expect(page).toHaveURL(/\/classes/);
  await expect(
    page.getByRole("button", { name: "수업 검색", exact: true }),
  ).toBeVisible();
});

test("모든 공개 화면은 합성 데이터임을 안내한다", async ({ page }) => {
  for (const path of ["/", "/classes", "/classes/math-1", "/teach"]) {
    await page.goto(path);
    await expect(
      page.getByText(/데모.*실제 결제 및 수강 불가/).first(),
    ).toBeVisible();
  }
});
