import { test, expect } from "@playwright/test";
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

test("부분 환불은 요청·처리 중·완료를 구분하고 선택한 회차만 취소한다", async ({
  page,
  context,
}) => {
  const scenario = fixture.refund;
  await login(context, scenario, "parent");
  const orderId = await createOrder(context, scenario);
  await payOrder(context, orderId);
  await page.goto("/parent/orders");
  await page.getByText("회차 선택하여 취소·환불 요청", { exact: true }).click();
  await page.getByRole("checkbox").first().check();
  await page
    .getByLabel("취소 사유", { exact: true })
    .fill("합성 테스트 일정 변경");
  await page
    .getByRole("button", {
      name: "가상 학생 학생의 선택 회차 취소 요청",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "취소 요청이 접수되었습니다" }),
  ).toBeVisible();
  let view = (
    await (await context.request.get(`/api/orders/${orderId}`)).json()
  ).value;
  expect(view.status).toBe("paid");
  expect(view.refunds[0].status).toBe("requested");
  expect(
    view.enrollment.sessions.filter(
      (session: { status: string }) => session.status === "refund_pending",
    ),
  ).toHaveLength(1);
  await expect(page.getByText("취소 처리 중", { exact: true })).toBeVisible();
  expect(
    (
      await context.request.post("/api/internal/jobs", { data: { limit: 20 } })
    ).status(),
  ).not.toBe(200);
  await runJobs(context);
  await page.reload();
  await expect(page.getByText("부분 환불 완료", { exact: true })).toBeVisible();
  await expect(page.getByText("환불 완료", { exact: true })).toBeVisible();
  view = (await (await context.request.get(`/api/orders/${orderId}`)).json())
    .value;
  expect(view.status).toBe("partially_refunded");
  expect(view.refunds[0].status).toBe("succeeded");
  expect(view.refunds[0].amountWon).toBe(50000);
  expect(
    view.enrollment.sessions
      .map((session: { status: string }) => session.status)
      .sort(),
  ).toEqual(["allowed", "cancelled"]);
  const duplicate = await context.request.post(
    `/api/orders/${orderId}/refunds`,
    {
      headers: { Origin: origin },
      data: {
        cancelSessionIds: [scenario.sessionId],
        reason: "중복 회차 요청",
        requestKey: "same-cancelled-session",
      },
    },
  );
  expect(duplicate.status()).not.toBe(200);
  await login(context, scenario, "owner");
  await page.goto("/academy/finance");
  await expect(
    page.getByRole("heading", { name: "환불", exact: true }),
  ).toBeVisible();
  const entries = await db.settlementEntry.findMany({ where: { orderId } });
  expect(
    entries.some(
      (entry) => entry.kind === "refund" && entry.amountWon === -50000,
    ),
  ).toBe(true);
});
