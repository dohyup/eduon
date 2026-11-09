import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fixture, login, createAssignment, post, value } from "./helpers";

test("학습 화면 5개 폭에서 기록·키보드·axe·가로 넘침을 확인한다", async ({
  page,
  context,
}) => {
  test.setTimeout(360000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const s = fixture.layout;
  await login(context, s, "teacher");
  const a = await createAssignment(context, s, "화면 검증 과제");
  await login(context, s, "student");
  const submitted = await value<{ submissionId: string }>(
    await post(context, `/api/assignments/${a.assignmentId}/submissions`, {
      text: "화면에서 확인할 실제 합성 제출 답안입니다.",
      fileIds: [],
    }),
  );
  await login(context, s, "teacher");
  await value(
    await post(context, `/api/submissions/${submitted.submissionId}/feedback`, {
      text: "답안과 설명을 확인했습니다.",
    }),
  );
  await mkdir(".tmp/p4-ui-screenshots", { recursive: true });
  const routes = [
    ["student", "/learn", "student-home"],
    ["student", `/learn/classes/${s.offeringId}`, "student-class"],
    ["teacher", `/instructor/classes/${s.offeringId}`, "instructor-class"],
    ["parent", "/parent/learning", "parent-learning"],
    [
      "parent",
      `/learn/classes/${s.offeringId}?studentId=${s.studentId}`,
      "parent-class",
    ],
    ["admin", "/admin/reports", "admin-reports"],
  ] as const;
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [role, path, name] of routes) {
      await login(context, s, role);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByText("내역을 불러오는 중입니다…", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("학습 내역을 확인하는 중입니다…", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      if (name.endsWith("class"))
        await expect(
          page.getByText("답안과 설명을 확인했습니다.", { exact: true }),
        ).toBeVisible();
      if (name === "student-home")
        await expect(
          page.getByRole("link", { name: "수업 입장·과제 확인" }),
        ).toBeVisible();
      if (name === "parent-learning")
        await expect(
          page.getByRole("combobox", { name: "학습 기록을 확인할 자녀" }),
        ).toHaveValue(s.studentId);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      if ([390, 1440].includes(width)) {
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(result.violations).toEqual([]);
      }
      await page.screenshot({
        path: `.tmp/p4-ui-screenshots/${name}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await login(context, s, "student");
  await page.goto(`/learn/classes/${s.offeringId}`);
  await expect(
    page.getByRole("heading", { name: "가상 수학", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  const button = page.getByRole("button", {
    name: "1회차 수업 입장",
    exact: true,
  });
  await button.focus();
  await expect(button).toBeFocused();
  const bounds = await button.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(browserErrors).toEqual([]);
});

test("연결 준비·로딩·권한 오류·재시도에서 허용되지 않은 학습 기록을 표시하지 않는다", async ({
  page,
  context,
}) => {
  const s = fixture.journey;
  await login(context, s, "student");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/learning/offerings"))
      requests.push(request.url());
  });
  await page.route("**/api/learning/readiness", (route) =>
    route.fulfill({
      status: 200,
      json: {
        ok: true,
        value: {
          enabled: false,
          videoConfigured: false,
          storageConfigured: false,
          scanningConfigured: false,
          testMode: false,
        },
      },
    }),
  );
  await page.goto("/learn");
  await expect(
    page.getByRole("heading", { name: "학습 서비스 연결 준비", exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);
  await page.unroute("**/api/learning/readiness");
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    `**/api/learning/offerings/${s.offeringId}?*`,
    async (route) => {
      await pending;
      await route.fulfill({
        status: 403,
        json: { ok: false, code: "FORBIDDEN" },
      });
    },
  );
  await page.goto(`/learn/classes/${s.offeringId}`);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "학습 내역을 확인하는 중입니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "가상 수학", exact: true }),
  ).toHaveCount(0);
  release!();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("권한");
  await expect(
    page.getByRole("heading", { name: "가상 수학", exact: true }),
  ).toHaveCount(0);
  await page.unroute(`**/api/learning/offerings/${s.offeringId}?*`);
  await page
    .getByRole("button", { name: "다시 불러오기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "가상 수학", exact: true }),
  ).toBeVisible();
});

test("과제 저장 실패 시 입력을 보존하고 재시도로 실제 과제를 등록한다", async ({
  page,
  context,
}) => {
  const s = fixture.journey;
  await login(context, s, "teacher");
  let failed = false;
  await page.route("**/api/assignments", async (route) => {
    if (route.request().method() === "POST" && !failed) {
      failed = true;
      await route.fulfill({
        status: 503,
        json: { ok: false, code: "PROVIDER_UNAVAILABLE" },
      });
    } else await route.continue();
  });
  await page.goto(`/instructor/classes/${s.offeringId}`);
  await page.getByText("새 과제 등록", { exact: true }).click();
  await page
    .getByLabel("과제 제목", { exact: true })
    .fill("저장 실패 후 재시도 과제");
  await page
    .getByLabel("과제 안내", { exact: true })
    .fill("입력값 보존 확인용 실제 합성 과제");
  await page
    .getByLabel("제출 마감 (한국시간)", { exact: true })
    .fill(
      new Date(Date.now() + 86400000 + 9 * 3600000).toISOString().slice(0, 16),
    );
  await page.getByRole("button", { name: "과제 등록", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "연결하지 못했습니다",
  );
  await expect(page.getByLabel("과제 제목", { exact: true })).toHaveValue(
    "저장 실패 후 재시도 과제",
  );
  await page.getByRole("button", { name: "과제 등록", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "저장 실패 후 재시도 과제",
      exact: true,
    }),
  ).toBeVisible();
});
