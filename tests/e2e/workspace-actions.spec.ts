import { test, expect } from "@playwright/test";

test("모바일 사이트 메뉴로 입점 안내에 접근한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/classes");
  await page.getByRole("button", { name: "사이트 메뉴", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "EDUON 메뉴" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "학원 입점 안내", exact: true }).click();
  await expect(page).toHaveURL(/\/teach$/);
  await expect(menu).not.toBeVisible();
});

test("학부모가 자녀를 바꾸면 수업과 과제가 함께 바뀐다", async ({ page }) => {
  await page.goto("/parent");
  const child = page.getByLabel("자녀 선택", { exact: true });
  await child.selectOption("child-2");
  await expect(
    page.getByRole("heading", {
      name: "이야기로 시작하는 영어 리딩",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("연결된 데모 프로필", { exact: false }),
  ).toBeVisible();
  await child.selectOption("child-1");
  await expect(
    page.getByRole("heading", {
      name: "이야기로 시작하는 영어 리딩",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("강사 출결 저장은 선택한 상태와 데모 유지 범위를 안내한다", async ({
  page,
}) => {
  await page.goto("/instructor");
  await page
    .getByLabel("가상 학생 가람 출결", { exact: true })
    .selectOption("late");
  await page.getByRole("button", { name: "출결 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "출결을 데모에 저장했어요 (지각)",
  );
  await expect(page.getByRole("status")).toContainText("새로고침하면 초기화");
  await page.reload();
  await expect(
    page.getByLabel("가상 학생 가람 출결", { exact: true }),
  ).toHaveValue("present");
});

test("운영자의 입점 승인과 보완 요청이 로컬 화면에 반영된다", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "승인", exact: true }).click();
  await expect(page.getByText("승인 처리", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("데모에서 승인 처리");
  await page.getByRole("button", { name: "보완 요청", exact: true }).click();
  await expect(
    page.locator("span").filter({ hasText: /^보완 요청$/ }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "실제 메시지는 발송되지 않습니다",
  );
});

test("빈 화면·오류·대기·로딩에서 기본 화면으로 복구한다", async ({ page }) => {
  await page.goto("/parent");
  const state = page.getByLabel("화면 상태 체험", { exact: true });
  await state.selectOption("empty");
  await expect(
    page.getByRole("heading", { name: "새로운 배움을 시작해 볼까요?" }),
  ).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: "수업 찾기", exact: true }),
  ).toBeVisible();
  await state.selectOption("error");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "데모 오류 상태",
  );
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(state).toHaveValue("normal");
  await expect(
    page.getByRole("heading", { name: "다음 수업", exact: true }),
  ).toBeVisible();
  await state.selectOption("pending");
  await expect(page.getByRole("status")).toContainText(
    "확인 전에는 수강·결제 완료로 표시하지 않습니다",
  );
  await state.selectOption("loading");
  await expect(page.getByRole("status")).toContainText(
    "내역을 불러오는 중입니다",
  );
  await page
    .getByRole("button", { name: "기본 화면으로 돌아가기", exact: true })
    .click();
  await expect(state).toHaveValue("normal");
  await expect(
    page.getByRole("heading", { name: "다음 수업", exact: true }),
  ).toBeVisible();
});

test("모바일에서 검색 조건을 열고 과목·예산 검색을 실행한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/classes");
  const toggle = page.getByRole("button", { name: "검색 조건 열기" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(
    page.getByRole("button", { name: "검색 조건 접기" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByLabel("과목", { exact: true }).selectOption("math");
  await page.getByLabel("최대 수강료", { exact: true }).fill("1");
  await page.getByRole("button", { name: "수업 검색", exact: true }).click();
  await expect(page).toHaveURL(/subject=math/);
  await expect(page).toHaveURL(/maxPriceWon=1/);
  await expect(page.locator('main a[href^="/classes/"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("공개 상단 메뉴에서 수업·입점·로그인·데모로 이동한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const header = page.locator(".site-header");
  await header.getByRole("link", { name: "수업 찾기", exact: true }).click();
  await expect(page).toHaveURL(/\/classes$/);
  await header
    .getByRole("link", { name: "학원 입점 안내", exact: true })
    .click();
  await expect(page).toHaveURL(/\/teach$/);
  await header.getByRole("link", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await header.getByRole("link", { name: "데모 체험" }).click();
  await expect(page).toHaveURL(/\/parent$/);
});
