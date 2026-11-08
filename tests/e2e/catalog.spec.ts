import { test, expect } from "@playwright/test";

test("과목을 검색하고 수업 상세와 학원 정보를 확인한다", async ({ page }) => {
  await page.goto("/classes");
  await page.getByLabel("과목", { exact: true }).selectOption("math");
  await page.getByRole("button", { name: "수업 검색", exact: true }).click();
  await expect(page).toHaveURL(/subject=math/);
  const details = page.locator('a[href="/classes/math-1"]').first();
  await expect(details).toBeVisible();
  await details.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const academyLink = page.locator('main a[href^="/academies/"]').first();
  await expect(academyLink).toBeVisible();
  await academyLink.click();
  await expect(page).toHaveURL(/\/academies\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("예산 조건의 빈 결과에서 검색 조건을 초기화한다", async ({ page }) => {
  await page.goto("/classes?maxPriceWon=1");
  await expect(page.locator('main a[href^="/classes/"]')).toHaveCount(0);
  const reset = page.getByRole("link", { name: /초기화|전체 수업/ }).first();
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(
    page.locator('main a[href="/classes/math-1"]').first(),
  ).toBeVisible();
});

test("데모 신청은 결제 성공으로 이동하지 않고 안내를 표시한다", async ({
  page,
}) => {
  await page.goto("/classes/math-1");
  const trigger = page.getByRole("button", { name: "수강 신청", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "데모 신청 안내" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/데모|실제/);
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/classes\/math-1$/);
});

test("잘못된 수업 ID는 상세 정보를 만들지 않는다", async ({ page }) => {
  const response = await page.goto("/classes/not-a-real-class");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("button", { name: "수강 신청", exact: true }),
  ).toHaveCount(0);
});

test("잘못된 검색값에도 화면과 수정 경로가 유지된다", async ({ page }) => {
  await page.goto("/classes?grade=999&maxPriceWon=-1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "수업 검색", exact: true }),
  ).toBeVisible();
});
