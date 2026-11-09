import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/server/client";
import {
  fixture,
  login,
  post,
  value,
  createAssignment,
  origin,
  runJobs,
} from "./helpers";
const db = createDatabase(process.env.DATABASE_URL!);
test.afterAll(async () => {
  await db.$disconnect();
});
test("현재 세션도 타 자녀·학원·보호자의 학습 쓰기와 입장을 거부한다", async ({
  context,
}) => {
  const s = fixture.security;
  await login(context, s, "teacher");
  const a = await createAssignment(context, s);
  await login(context, s, "otherTeacher");
  for (const path of [
    `/api/learning/offerings/${s.offeringId}?view=instructor`,
    `/api/assignments?offeringId=${s.offeringId}`,
    `/api/materials?offeringId=${s.offeringId}`,
  ])
    expect([403, 404]).toContain((await context.request.get(path)).status());
  expect([403, 404]).toContain(
    (await post(context, `/api/sessions/${s.sessionId}/join`, {})).status(),
  );
  await login(context, s, "parent");
  expect([403, 404]).toContain(
    (await post(context, `/api/sessions/${s.sessionId}/join`, {})).status(),
  );
  expect([403, 404]).toContain(
    (
      await post(context, `/api/assignments/${a.assignmentId}/submissions`, {
        text: "보호자 대리 제출",
        fileIds: [],
      })
    ).status(),
  );
  expect([403, 404]).toContain(
    (
      await context.request.get(
        `/api/learning/summary?studentId=${s.otherStudentId}`,
      )
    ).status(),
  );
  await login(context, s, "student");
  expect([403, 404]).toContain(
    (
      await context.request.get(
        `/api/learning/offerings/${s.offeringId}?view=parent&studentId=${s.otherStudentId}`,
      )
    ).status(),
  );
  await login(context, s, "otherParent");
  expect([403, 404]).toContain(
    (await context.request.get(`/api/orders/${s.orderId}`)).status(),
  );
  expect([403, 404]).toContain(
    (
      await context.request.get(
        `/api/learning/offerings/${s.offeringId}?view=parent&studentId=${s.studentId}`,
      )
    ).status(),
  );
});
test("보호자 연결 해제·강사 해임 뒤 같은 쿠키로 새 요청을 해도 권한이 즉시 사라진다", async ({
  page,
  context,
}) => {
  const s = fixture.revoked;
  await login(context, s, "parent");
  expect(
    (
      await context.request.get(
        `/api/learning/summary?studentId=${s.studentId}`,
      )
    ).status(),
  ).toBe(200);
  await db.guardianLink.update({
    where: {
      guardianId_studentId: {
        guardianId: s.parent.userId,
        studentId: s.studentId,
      },
    },
    data: { revokedAt: new Date() },
  });
  expect([403, 404]).toContain(
    (
      await context.request.get(
        `/api/learning/summary?studentId=${s.studentId}`,
      )
    ).status(),
  );
  await page.goto(`/learn/classes/${s.offeringId}?studentId=${s.studentId}`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("권한");
  await expect(page.getByText("가상 수학", { exact: true })).toHaveCount(0);
  await login(context, s, "teacher");
  expect(
    (await post(context, `/api/sessions/${s.sessionId}/join`, {})).status(),
  ).toBe(200);
  await db.academyMembership.update({
    where: {
      academyId_userId: { academyId: s.academyId, userId: s.teacher.userId },
    },
    data: { active: false },
  });
  expect([403, 404]).toContain(
    (await post(context, `/api/sessions/${s.sessionId}/join`, {})).status(),
  );
  expect([403, 404]).toContain(
    (
      await post(context, `/api/sessions/${s.sessionId}/attendance`, {
        studentId: s.studentId,
        status: "present",
        reason: "해임된 강사의 요청",
      })
    ).status(),
  );
});
test("부분 환불로 취소한 회차만 입장을 차단하고 유효한 다른 회차는 유지한다", async ({
  context,
}) => {
  const s = fixture.refund;
  await login(context, s, "parent");
  await value(
    await post(context, `/api/orders/${s.orderId}/refunds`, {
      cancelSessionIds: [s.secondSessionId],
      reason: "합성 부분 환불 회차 취소",
      requestKey: randomUUID(),
    }),
  );
  await runJobs(context);
  await login(context, s, "student");
  expect(
    (await post(context, `/api/sessions/${s.sessionId}/join`, {})).status(),
  ).toBe(200);
  expect([403, 404]).toContain(
    (
      await post(context, `/api/sessions/${s.secondSessionId}/join`, {})
    ).status(),
  );
});
test("위장 파일·감염 파일을 거부하고 학생 파일은 과제 문맥과 권한 확인 뒤에만 연다", async ({
  context,
}) => {
  const s = fixture.history;
  await login(context, s, "teacher");
  const a = await createAssignment(context, s);
  const upload = async (name: string, mime: string, body: Buffer) =>
    context.request.post("/api/materials/upload", {
      headers: {
        Origin: origin,
        "Content-Type": "application/octet-stream",
        "x-offering-id": s.offeringId,
        "x-purpose": "submission",
        "x-file-name": encodeURIComponent(name),
        "x-file-type": mime,
      },
      data: body,
    });
  await login(context, s, "student");
  expect(
    (
      await upload(
        "거짓.pdf",
        "application/pdf",
        Buffer.from("this is not a PDF"),
      )
    ).status(),
  ).toBe(422);
  const infected = await upload(
    "감염.pdf",
    "application/pdf",
    Buffer.from("%PDF-1.7\nEICAR"),
  );
  const infectedBody = await infected.json();
  expect(infectedBody.ok && infectedBody.value.scanStatus === "clean").toBe(
    false,
  );
  const file = await value<{ materialId: string; scanStatus: string }>(
    await upload(
      "답안.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.7\nsynthetic answer"),
    ),
  );
  expect(file.scanStatus).toBe("clean");
  const submitted = await value<{ submissionId: string }>(
    await post(context, `/api/assignments/${a.assignmentId}/submissions`, {
      text: "첫 답안",
      fileIds: [file.materialId],
    }),
  );
  await value(
    await post(context, `/api/assignments/${a.assignmentId}/submissions`, {
      text: "두 번째 답안",
      fileIds: [],
    }),
  );
  expect(
    (
      await context.request.get(`/api/materials/${file.materialId}/download`)
    ).status(),
  ).toBe(422);
  const link = await value<{ url: string }>(
    await context.request.get(
      `/api/materials/${file.materialId}/download?assignmentId=${a.assignmentId}`,
    ),
  );
  expect(new URL(link.url).hostname).toBe("storage.example.test");
  await login(context, s, "otherParent");
  expect([403, 404]).toContain(
    (
      await context.request.get(
        `/api/materials/${file.materialId}/download?assignmentId=${a.assignmentId}&studentId=${s.studentId}`,
      )
    ).status(),
  );
  expect([403, 404]).toContain(
    (
      await post(
        context,
        `/api/submissions/${submitted.submissionId}/feedback`,
        { text: "타 보호자 피드백" },
      )
    ).status(),
  );
  await login(context, s, "teacher");
  await value(
    await post(context, `/api/submissions/${submitted.submissionId}/feedback`, {
      text: "첫 번째 피드백",
    }),
  );
  await value(
    await post(context, `/api/submissions/${submitted.submissionId}/feedback`, {
      text: "보완한 피드백",
    }),
  );
  await login(context, s, "parent");
  const overview = await value<{
    assignments: {
      submissions: {
        version: number;
        feedback: { version: number; text: string }[];
      }[];
    }[];
  }>(
    await context.request.get(
      `/api/learning/offerings/${s.offeringId}?view=parent&studentId=${s.studentId}`,
    ),
  );
  expect(
    overview.assignments[0].submissions.map((item) => item.version).sort(),
  ).toEqual([1, 2]);
  const first = overview.assignments[0].submissions.find(
    (item) => item.version === 1,
  )!;
  expect(first.feedback.map((item) => item.text)).toEqual(
    expect.arrayContaining(["첫 번째 피드백", "보완한 피드백"]),
  );
});
