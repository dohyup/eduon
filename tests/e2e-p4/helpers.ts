import { expect, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { signTestSession } from "../../src/integrations/auth/test-session";
export type Scenario = {
  parent: { userId: string };
  otherParent: { userId: string };
  student: { userId: string };
  owner: { userId: string };
  otherOwner: { userId: string };
  teacher: { userId: string };
  otherTeacher: { userId: string };
  admin: { userId: string };
  studentId: string;
  otherStudentId: string;
  offeringId: string;
  academyId: string;
  courseId: string;
  sessionId: string;
  secondSessionId?: string;
  orderId: string;
  enrollmentId: string;
};
export const fixture = JSON.parse(
  readFileSync(process.env.P4_FIXTURE_PATH!, "utf8"),
) as Record<string, Scenario>;
export const origin = "http://127.0.0.1:3103";
export async function login(
  context: BrowserContext,
  s: Scenario,
  role: keyof Pick<
    Scenario,
    | "parent"
    | "otherParent"
    | "student"
    | "teacher"
    | "otherTeacher"
    | "owner"
    | "otherOwner"
    | "admin"
  >,
) {
  await context.addCookies([
    {
      name: "eduon-test-session",
      value: signTestSession(s[role].userId, process.env.E2E_AUTH_SECRET!),
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
export async function post(
  context: BrowserContext,
  path: string,
  data: unknown,
) {
  return context.request.post(path, { headers: { Origin: origin }, data });
}
export async function value<T>(
  response: Awaited<ReturnType<typeof post>>,
): Promise<T> {
  expect(response.status(), `${response.url()} ${await response.text()}`).toBe(
    200,
  );
  const result = await response.json();
  expect(result.ok).toBe(true);
  return result.value as T;
}
export async function createAssignment(
  context: BrowserContext,
  s: Scenario,
  title = "분수의 이해",
) {
  return value<{ assignmentId: string }>(
    await post(context, "/api/assignments", {
      offeringId: s.offeringId,
      title,
      instructions: "풀이 과정을 설명해 주세요.",
      dueAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  );
}
export async function freshKey() {
  return randomUUID();
}
export async function runJobs(context: BrowserContext) {
  const body = JSON.stringify({ limit: 20 }),
    timestamp = Math.floor(Date.now() / 1000).toString(),
    nonce = randomBytes(16).toString("hex"),
    signature = createHmac("sha256", process.env.JOBS_SECRET!)
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
