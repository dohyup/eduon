import { expect, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { signTestSession } from "../../src/integrations/auth/test-session";
export type Scenario = {
  parent: { userId: string };
  otherParent: { userId: string };
  student: { userId: string };
  owner: { userId: string };
  otherOwner: { userId: string };
  admin: { userId: string };
  studentId: string;
  offeringId: string;
  academyId: string;
  otherAcademyId: string;
  sessionId: string;
  secondSessionId: string;
};
export const fixture = JSON.parse(
  readFileSync(process.env.P3_FIXTURE_PATH!, "utf8"),
) as Record<string, Scenario>;
export const origin = "http://127.0.0.1:3102";
export async function login(
  context: BrowserContext,
  scenario: Scenario,
  role: "parent" | "otherParent" | "student" | "owner" | "otherOwner" | "admin",
) {
  await context.addCookies([
    {
      name: "eduon-test-session",
      value: signTestSession(
        scenario[role].userId,
        process.env.E2E_AUTH_SECRET!,
      ),
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
export async function createOrder(context: BrowserContext, scenario: Scenario) {
  const response = await context.request.post("/api/orders", {
    headers: { Origin: origin },
    data: {
      studentId: scenario.studentId,
      offeringId: scenario.offeringId,
      requestKey: randomUUID(),
      consent: true,
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const result = await response.json();
  expect(result.ok).toBe(true);
  return result.value.orderId as string;
}
export async function payOrder(context: BrowserContext, orderId: string) {
  const prepared = await context.request.post("/api/payments/prepare", {
    headers: { Origin: origin },
    data: { orderId, requestKey: randomUUID() },
  });
  expect(prepared.status(), await prepared.text()).toBe(200);
  const paid = await context.request.post("/api/payments/test", {
    headers: { Origin: origin },
    data: { orderId },
  });
  expect(paid.status(), await paid.text()).toBe(200);
}
export async function runJobs(context: BrowserContext) {
  const body = JSON.stringify({ limit: 20 });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", process.env.JOBS_SECRET!)
    .update(`${timestamp}.${nonce}.`)
    .update(body)
    .digest("hex");
  const response = await context.request.post("/api/internal/jobs", {
    headers: {
      "Content-Type": "application/json",
      "x-eduon-timestamp": timestamp,
      "x-eduon-nonce": nonce,
      "x-eduon-signature": signature,
    },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
