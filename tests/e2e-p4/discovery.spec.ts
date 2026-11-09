import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/server/client";
import { fixture, login, post } from "./helpers";
const db = createDatabase(process.env.DATABASE_URL!);
test.afterAll(async () => {
  await db.$disconnect();
});

test("탐색 계측이 제한되어도 보호자의 수강 신청 요청은 별도 한도로 처리한다", async ({
  context,
}) => {
  const s = fixture.authoring;
  await db.offering.update({
    where: { id: s.offeringId },
    data: {
      status: "published",
      enrollmentOpensAt: new Date(Date.now() - 86400000),
      enrollmentClosesAt: new Date(Date.now() + 86400000),
    },
  });
  await login(context, s, "parent");
  const orderInput = {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: randomUUID(),
    consent: true,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const telemetryStatuses: number[] = [];
    // 130 requests cover a real minute rollover while filling a 60/min bucket.
    for (let index = 0; index < 130; index++) {
      const response = await post(context, "/api/analytics/events", {
        offeringId: s.offeringId,
        stage: "search",
        requestKey: randomUUID(),
      });
      telemetryStatuses.push(response.status());
      if (response.status() === 429) break;
    }
    expect(telemetryStatuses).toContain(429);
    expect(
      telemetryStatuses.every((status) => status === 200 || status === 429),
    ).toBe(true);
    const exhaustedBucket = Math.floor(Date.now() / 60000);
    const order = await post(context, "/api/orders", orderInput);
    const orderBucket = Math.floor(Date.now() / 60000);
    // A boundary must not let shared-budget code pass accidentally. Reuse the
    // order request key if the first successful request crossed that boundary.
    if (exhaustedBucket !== orderBucket && attempt === 0) continue;
    expect(orderBucket).toBe(exhaustedBucket);
    expect(order.status(), await order.text()).toBe(200);
    const body = await order.json();
    expect(body.ok).toBe(true);
    expect(body.value.orderId).toMatch(/^[a-f0-9-]{36}$/);
    return;
  }
});
test("인증된 검색 노출·상세 전환만 기록하고 같은 세션의 재노출과 중복 요청을 제거한다", async ({
  page,
  context,
}) => {
  const s = fixture.journey,
    requests: { offeringId: string; stage: string; requestKey: string }[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/analytics/events")
    )
      requests.push(request.postDataJSON() as (typeof requests)[number]);
  });
  await page.goto("/classes");
  const link = page.locator(`a[href="/classes/${s.offeringId}"]`);
  await expect(link).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(requests).toEqual([]);
  await login(context, s, "parent");
  await page.reload();
  await link.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      requests.some(
        (event) =>
          event.offeringId === s.offeringId && event.stage === "search",
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      db.analyticsEvent.count({
        where: {
          actorId: s.parent.userId,
          offeringId: s.offeringId,
          stage: "search",
        },
      }),
    )
    .toBe(1);
  const search = requests.find(
    (event) => event.offeringId === s.offeringId && event.stage === "search",
  )!;
  expect(Object.keys(search).sort()).toEqual([
    "offeringId",
    "requestKey",
    "stage",
  ]);
  expect(search.requestKey).toMatch(/^[a-f0-9-]{36}$/);
  await page.reload();
  await link.scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect((await post(context, "/api/analytics/events", search)).status()).toBe(
    200,
  );
  expect((await post(context, "/api/analytics/events", search)).status()).toBe(
    200,
  );
  expect(
    await db.analyticsEvent.count({
      where: {
        actorId: s.parent.userId,
        offeringId: s.offeringId,
        stage: "search",
      },
    }),
  ).toBe(1);
  await link.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("가상 수학");
  await expect
    .poll(() =>
      db.analyticsEvent.count({
        where: {
          actorId: s.parent.userId,
          offeringId: s.offeringId,
          stage: "detail",
        },
      }),
    )
    .toBe(1);
  const detail = requests.find(
    (event) => event.offeringId === s.offeringId && event.stage === "detail",
  )!;
  expect(Object.keys(detail).sort()).toEqual([
    "offeringId",
    "requestKey",
    "stage",
  ]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("가상 수학");
  expect((await post(context, "/api/analytics/events", detail)).status()).toBe(
    200,
  );
  expect(
    await db.analyticsEvent.count({
      where: {
        actorId: s.parent.userId,
        offeringId: s.offeringId,
        stage: "detail",
      },
    }),
  ).toBe(1);
});
