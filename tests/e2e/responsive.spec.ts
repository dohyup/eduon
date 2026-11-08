import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const widths = [360, 390, 768, 1024, 1440];
const routes = [
  "/",
  "/classes",
  "/classes/math-1",
  "/parent",
  "/learn",
  "/academy",
  "/instructor",
  "/admin",
];

test("모바일 홈의 제목이 잘리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const box = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

for (const width of widths) {
  test(`핵심 화면이 ${width}px에서 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByText(/데모.*실제 결제 및 수강 불가/).first(),
      ).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(dimensions.scroll, `${route} at ${width}px`).toBeLessThanOrEqual(
        dimensions.viewport,
      );
    }
  });
}

for (const route of ["/", "/classes", "/parent"]) {
  test(`${route} 접근성 자동 검사`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("역할별 하위 데모 페이지에 접근할 수 있다", async ({ page }) => {
  const pages = [
    "/parent/children",
    "/parent/orders",
    "/learn/classes/math-1",
    "/academy/classes",
    "/academy/students",
    "/academy/finance",
    "/instructor/classes/math-1",
    "/admin/academies",
    "/admin/payments",
    "/login",
    "/signup",
    "/onboarding",
  ];
  for (const route of pages) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByText(/데모.*실제 결제 및 수강 불가/).first(),
    ).toBeVisible();
  }
});
