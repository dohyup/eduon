import AxeBuilder from "@axe-core/playwright";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { signTestSession } from "../../src/integrations/auth/test-session";
const fixture = JSON.parse(readFileSync(process.env.P2_FIXTURE_PATH!, "utf8"));
const origin = "http://127.0.0.1:3101";
async function login(context: BrowserContext, role: string) {
  await context.addCookies([
    {
      name: "eduon-test-session",
      value: signTestSession(
        fixture[role].userId,
        process.env.E2E_AUTH_SECRET!,
      ),
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test("미인증·외부 Origin·위조 쿠키를 거부한다", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/me")).status()).toBe(401);
  await login(context, "parent");
  const forbidden = await context.request.post("/api/children", {
    headers: { Origin: "https://attacker.invalid" },
    data: { name: "가상 아이", grade: 5 },
  });
  expect(forbidden.status()).toBe(403);
  await context.addCookies([
    { name: "eduon-test-session", value: "forged", url: origin },
  ]);
  expect((await context.request.get("/api/me")).status()).toBe(401);
  await page.goto("/parent");
  await expect(page).toHaveURL(/\/login/);
});
test("보호자 자녀 등록과 학생 초대는 수신 계정으로만 연결된다", async ({
  page,
  context,
}) => {
  await login(context, "parent");
  await page.goto("/parent/children");
  await page
    .getByLabel("자녀 이름", { exact: true })
    .fill("브라우저 가상 자녀");
  await page.getByRole("button", { name: "자녀 등록", exact: true }).click();
  await expect(
    page.getByText("브라우저 가상 자녀", { exact: true }),
  ).toBeVisible();
  const response = await context.request.post("/api/guardian-invitations", {
    headers: { Origin: origin },
    data: { studentId: fixture.studentId, email: fixture.studentEmail },
  });
  expect(response.status()).toBe(200);
  const issued = await response.json();
  const link = new URL(issued.value.inviteUrl);
  const token = new URLSearchParams(link.hash.slice(1)).get("token");
  await login(context, "otherParent");
  expect(
    (
      await context.request.post("/api/guardian-invitations/accept", {
        headers: { Origin: origin },
        data: { token },
      })
    ).status(),
  ).toBe(403);
  await login(context, "student");
  await page.goto(link.toString());
  await page.getByRole("button", { name: "초대 수락", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("초대를 수락했습니다");
  expect((await context.request.get("/api/me")).status()).toBe(200);
});
test("다른 학원은 초안 수정과 공개를 할 수 없다", async ({ context }) => {
  await login(context, "otherOwner");
  expect(
    (
      await context.request.post(
        `/api/offerings/${fixture.offeringId}/publish`,
        { headers: { Origin: origin }, data: {} },
      )
    ).status(),
  ).toBe(403);
  const rows = await (await context.request.get("/api/offerings")).json();
  expect(
    rows.value.some((o: { id: string }) => o.id === fixture.offeringId),
  ).toBe(false);
});
test("원장 입점 신청과 운영자 승인이 실제 DB에 반영된다", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  await page.goto("/academy");
  await page
    .getByLabel("학원 이름", { exact: true })
    .fill("브라우저 검증 학원");
  await page.getByLabel("학원 지역", { exact: true }).fill("대구");
  await page.getByRole("button", { name: "입점 신청", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "브라우저 검증 학원", exact: true }),
  ).toBeVisible();
  await login(context, "admin");
  await page.goto("/admin/academies");
  const item = page
    .locator("li")
    .filter({
      has: page.getByRole("heading", {
        name: "브라우저 검증 학원",
        exact: true,
      }),
    });
  await item.getByLabel("심사 사유").fill("합성 학원 정보와 대표자 확인 완료");
  await item.getByRole("button", { name: "승인", exact: true }).click();
  await expect(
    item.locator("span").filter({ hasText: /^승인$/ }),
  ).toBeVisible();
  const rows = await (
    await context.request.get("/api/academies?review=true")
  ).json();
  expect(
    rows.value.find((a: { name: string }) => a.name === "브라우저 검증 학원")
      .status,
  ).toBe("approved");
});
test("비운영자는 심사와 보호자 확인 권한을 얻지 못한다", async ({
  context,
}) => {
  await login(context, "parent");
  expect(
    (await context.request.get("/api/academies?review=true")).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/guardian-verifications", {
        headers: { Origin: origin },
        data: {
          userId: fixture.parent.userId,
          reason: "임의 보호자 확인 시도",
        },
      })
    ).status(),
  ).toBe(403);
});
test("공개 수업은 DB에서 검색되고 명단·초대·메일은 노출되지 않는다", async ({
  page,
}) => {
  await page.goto("/classes?subject=math");
  await expect(page.getByRole("link", { name: /가상 수학/ })).toBeVisible();
  await page.getByRole("link", { name: /가상 수학/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("가상 수학");
  await expect(
    page.getByText(fixture.studentEmail, { exact: false }),
  ).toHaveCount(0);
});

test("원장이 수업 초안을 개설하고 공개 검색에 연결한다", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  await page.goto("/academy/classes");
  await page
    .getByRole("combobox", { name: "관리 학원" })
    .selectOption(fixture.academyId);
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "수업 초안 등록", exact: true }),
  });
  await form.locator('[name="title"]').fill("브라우저 개설 영어");
  await form.locator('[name="subject"]').selectOption("english");
  await form.locator('[name="gradeMin"]').selectOption("4");
  await form.locator('[name="gradeMax"]').selectOption("6");
  await form.locator('[name="priceWon"]').fill("125000");
  await form.locator('[name="capacity"]').fill("5");
  await form.locator('[name="opensAt"]').fill("2020-01-01T09:00");
  await form.locator('[name="closesAt"]').fill("2034-12-31T18:00");
  await form.locator('[name="startsAt"]').fill("2035-01-01T17:00");
  await form.locator('[name="endsAt"]').fill("2035-01-01T17:50");
  await form
    .getByRole("button", { name: "수업 초안 등록", exact: true })
    .click();
  const row = page.locator("li").filter({
    has: page.getByRole("heading", {
      name: "브라우저 개설 영어",
      exact: true,
    }),
  });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "수업 공개", exact: true }).click();
  await expect(
    row.getByRole("link", { name: "공개 화면 확인 →" }),
  ).toBeVisible();
  await page.goto("/classes?subject=english");
  await expect(
    page.getByRole("link", { name: /브라우저 개설 영어/ }),
  ).toBeVisible();
});

test("실제 데이터 화면의 모바일·데스크톱·접근성을 확인한다", async ({
  page,
  context,
}) => {
  const roles = [
    ["parent", "/parent"],
    ["owner", "/academy"],
    ["admin", "/admin"],
    ["teacher", "/instructor"],
    ["student", "/learn"],
  ];
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [role, path] of roles) {
      await login(context, role);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
      await expect(page.getByText('내역을 불러오는 중입니다…',{exact:true})).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (width === 390) {
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(result.violations).toEqual([]);
      }
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: `docs/operations/screenshots/p2-${role}-${width}.png`,
          fullPage: true,
        });
    }
  }
});
