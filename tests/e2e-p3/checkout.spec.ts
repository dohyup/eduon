import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createDatabase } from "../../src/server/client";
import {
  fixture,
  login,
  createOrder,
  payOrder,
  runJobs,
  origin,
} from "./helpers";
const db = createDatabase(process.env.DATABASE_URL!);
test.afterAll(async () => {
  await db.$disconnect();
});

test("연결된 자녀 선택·정책 동의·모의 결제로 수강권을 한 번 발급한다", async ({
  page,
  context,
}) => {
  const scenario = fixture.checkout;
  await login(context, scenario, "parent");
  await page.goto(`/classes/${scenario.offeringId}`);
  await expect(page.getByRole("combobox", { name: "수강할 자녀" })).toHaveValue(
    scenario.studentId,
  );
  await expect(
    page.getByRole("button", { name: "신청 내용 확인하기" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "신청 내용 확인하기" }).click();
  await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
  const orderId = page.url().split("/").at(-1)!;
  await expect(
    page.getByRole("heading", { name: "주문에 기록된 정책" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "테스트 결제 준비" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "테스트 결제 준비" }).click();
  await page
    .getByRole("button", {
      name: "모의 결제 실행 (실제 청구 없음)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "수강권이 발급되었습니다" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "결과 상태 보기" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "결제 처리 상태",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "수강권이 발급되었습니다" }),
  ).toBeVisible();
  expect(await db.enrollment.count({ where: { orderId } })).toBe(1);
  const enrollment = await db.enrollment.findUniqueOrThrow({
    where: { orderId },
    include: { sessions: true },
  });
  expect(enrollment.status).toBe("active");
  expect(enrollment.sessions.map((session) => session.status)).toEqual([
    "allowed",
    "allowed",
  ]);
  await login(context, scenario, "student");
  const me = await (await context.request.get("/api/me")).json();
  expect(me.value.student.id).toBe(enrollment.studentId);
  expect([403, 404]).toContain(
    (await context.request.get(`/api/orders/${orderId}`)).status(),
  );
  await page.goto("/learn");
  await expect(
    page.getByRole("heading", { name: "나의 학생 프로필" }),
  ).toBeVisible();
});

test("결과 URL 위조는 결제나 수강권을 만들지 않고 타 보호자는 주문에 접근하지 못한다", async ({
  page,
  context,
  request,
}) => {
  const scenario = fixture.security;
  await page.goto(`/checkout/${scenario.offeringId}`);
  await expect(page).toHaveURL(/\/login/);
  expect(
    (
      await request.post("/api/payments/test", {
        headers: { Origin: origin },
        data: { orderId: scenario.offeringId },
      })
    ).status(),
  ).toBe(401);
  await login(context, scenario, "parent");
  const orderId = await createOrder(context, scenario);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/"))
      mutations.push(request.url());
  });
  await page.goto(
    `/checkout/${orderId}/result?status=paid&success=true&transactionId=forged`,
  );
  await expect(page.getByText("현재 상태:")).toContainText("결제 대기");
  expect(mutations).toEqual([]);
  expect(await db.enrollment.count({ where: { orderId } })).toBe(0);
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status,
  ).toBe("pending_payment");
  await login(context, scenario, "otherParent");
  expect([403, 404]).toContain(
    (await context.request.get(`/api/orders/${orderId}`)).status(),
  );
  for (const [path, data] of [
    ["/api/payments/prepare", { orderId, requestKey: "foreign-order" }],
    ["/api/payments/test", { orderId }],
    [
      `/api/orders/${orderId}/refunds`,
      {
        cancelSessionIds: [scenario.sessionId],
        reason: "타 보호자 요청",
        requestKey: "foreign-refund",
      },
    ],
  ] as const) {
    expect([403, 404]).toContain(
      (
        await context.request.post(path, { headers: { Origin: origin }, data })
      ).status(),
    );
  }
  await login(context, scenario, "otherOwner");
  expect([403, 404]).toContain(
    (
      await context.request.get(
        `/api/settlements?academyId=${scenario.academyId}`,
      )
    ).status(),
  );
});

test("주문 응답을 잃은 뒤 재시도해도 같은 요청키로 주문 하나를 확인한다", async ({
  page,
  context,
}) => {
  const scenario = fixture.retry;
  await login(context, scenario, "parent");
  const keys: string[] = [];
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    keys.push(
      (route.request().postDataJSON() as { requestKey: string }).requestKey,
    );
    if (keys.length === 1) {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto(`/classes/${scenario.offeringId}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "신청 내용 확인하기" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "같은 자녀로 다시 시도하면 기존 요청을 확인합니다" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "신청 내용 확인하기" }).click();
  await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(
    await db.order.count({
      where: {
        parentId: scenario.parent.userId,
        offeringId: scenario.offeringId,
      },
    }),
  ).toBe(1);
});

test("운영자는 실패한 거래 작업을 재처리하고 수강권 중복 없이 복구한다", async ({
  page,
  context,
}) => {
  const scenario = fixture.admin;
  await login(context, scenario, "parent");
  const orderId = await createOrder(context, scenario);
  await payOrder(context, orderId);
  const job = await db.job.create({
    data: {
      type: "reconcile",
      status: "failed",
      dedupeKey: `e2e-admin:${orderId}`,
      payloadJson: { orderId },
      lastError: "SYNTHETIC_TEST_FAILURE",
      attempts: 5,
    },
  });
  await login(context, scenario, "admin");
  await page.goto("/admin/payments");
  const item = page.locator("li").filter({ hasText: orderId });
  await expect(item).toContainText("SYNTHETIC_TEST_FAILURE");
  await item
    .getByRole("button", { name: "거래 작업 재처리", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "기존 거래 작업의 재처리를 예약했습니다" }),
  ).toBeVisible();
  const scheduled = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  expect(scheduled.status).toBe("pending");
  expect(scheduled.attempts).toBe(0);
  await runJobs(context);
  expect(
    (await db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
  ).toBe("succeeded");
  expect(await db.enrollment.count({ where: { orderId } })).toBe(1);
});

test("거래 화면 5개 폭·키보드·접근성과 가로 넘침을 확인한다", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  const scenario = fixture.layout;
  await login(context, scenario, "parent");
  const orderId = await createOrder(context, scenario);
  await payOrder(context, orderId);
  await mkdir(".tmp/p3-ui-screenshots", { recursive: true });
  const routes = [
    ["parent", `/checkout/${orderId}`, "checkout"],
    ["parent", `/checkout/${orderId}/result`, "result"],
    ["parent", "/parent/orders", "orders"],
    ["owner", "/academy/finance", "finance"],
    ["admin", "/admin/payments", "payments"],
  ] as const;
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [role, path, name] of routes) {
      await login(context, scenario, role);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByText("내역을 확인하는 중입니다…", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("내역을 불러오는 중입니다…", { exact: true }),
      ).toHaveCount(0);
      if (name === "checkout" || name === "result") {
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: "수강권이 발급되었습니다" }),
        ).toBeVisible();
      } else if (name === "orders") {
        await expect(
          page.getByRole("heading", {
            name: "가상 학생 학생의 주문",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByText("2회차 · 2030년 1월 8일 10:00", { exact: true }),
        ).toBeVisible();
      } else if (name === "finance") {
        await expect(
          page.getByRole("heading", { name: "학원 귀속", exact: true }),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (name === "payments")
        await page.getByText("확인된 외부 송금 기록", { exact: true }).click();
      if (name === "payments")
        await expect(
          page
            .getByRole("combobox", { name: "지급할 학원 귀속 정산 항목" })
            .locator("option"),
        ).not.toHaveCount(1);
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
        path: `.tmp/p3-ui-screenshots/${name}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto(`/checkout/${orderId}/result`);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
