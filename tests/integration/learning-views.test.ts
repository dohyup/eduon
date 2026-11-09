import { beforeEach, afterEach, it, expect } from "vitest";
import { createTestDatabase } from "../support/database";
import {
  seedLearningScenario,
  systemContext,
  payOrder,
} from "../support/learning";
import { makeContext } from "../support/context";
import { createOrder } from "../../src/modules/enrollment/orders";
import {
  createAssignment,
  submitAssignment,
  listAssignments,
} from "../../src/modules/learning/assignments";
import { getLearningOverview } from "../../src/modules/learning/views";
import { getLearningSummary } from "../../src/modules/learning/summary";
let store: Awaited<ReturnType<typeof createTestDatabase>>,
  s: Awaited<ReturnType<typeof seedLearningScenario>>;
const now = new Date("2029-12-01T00:00:00Z");
beforeEach(async () => {
  store = await createTestDatabase();
  s = await seedLearningScenario(store.db, { now, capacity: 4 });
});
afterEach(async () => {
  await store?.close();
});
it("student and linked guardian overviews never include a classmate answer", async () => {
  const account = await store.db.user.create({
    data: { email: "classmate@example.test" },
  });
  await store.db.studentProfile.update({
    where: { id: s.otherStudentId },
    data: { accountUserId: account.id },
  });
  const order = await createOrder(makeContext(store.db, s.otherParent, now), {
    studentId: s.otherStudentId,
    offeringId: s.offeringId,
    requestKey: "other",
    consent: true,
  });
  if (!order.ok) throw Error(order.code);
  await payOrder(systemContext(store.db, now), order.value.orderId);
  const a = await createAssignment(makeContext(store.db, s.teacher, now), {
    offeringId: s.offeringId,
    title: "문제",
    instructions: "풀이",
    dueAt: "2030-01-02T00:00:00Z",
  });
  if (!a.ok) throw Error(a.code);
  await submitAssignment(makeContext(store.db, s.student, now), {
    assignmentId: a.value.assignmentId,
    text: "own-answer",
    fileIds: [],
  });
  await submitAssignment(makeContext(store.db, { userId: account.id }, now), {
    assignmentId: a.value.assignmentId,
    text: "PRIVATE-CLASSMATE-ANSWER",
    fileIds: [],
  });
  for (const actor of [s.student, s.parent]) {
    const result = await getLearningOverview(
      makeContext(store.db, actor, now),
      s.offeringId,
      actor === s.parent ? { studentId: s.studentId } : {},
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain("own-answer");
    expect(JSON.stringify(result)).not.toContain("PRIVATE-CLASSMATE-ANSWER");
  }
});
it("initial and continuation assignment pages cover all rows once", async () => {
  await store.db.assignment.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      academyId: s.academyId,
      offeringId: s.offeringId,
      title: `과제 ${i}`,
      instructions: "",
      dueAt: new Date("2030-01-02"),
      createdById: s.teacher.userId,
      createdAt: new Date(now.getTime() + 25 - i),
    })),
  });
  const initial = await getLearningOverview(
    makeContext(store.db, s.student, now),
    s.offeringId,
  );
  if (!initial.ok) throw Error(initial.code);
  expect(initial.value.assignments).toHaveLength(20);
  expect(initial.value.assignmentsNextCursor).toBeTruthy();
  const next = await listAssignments(makeContext(store.db, s.student, now), {
    offeringId: s.offeringId,
    cursor: initial.value.assignmentsNextCursor!,
  });
  if (!next.ok) throw Error(next.code);
  const ids = [...initial.value.assignments, ...next.value].map((a) => a.id);
  expect(ids).toHaveLength(25);
  expect(new Set(ids).size).toBe(25);
});
it("summary uses actual records and revoked guardians lose access", async () => {
  await createAssignment(makeContext(store.db, s.teacher, now), {
    offeringId: s.offeringId,
    title: "미제출",
    instructions: "",
    dueAt: "2030-01-02T00:00:00Z",
  });
  expect(
    await getLearningSummary(makeContext(store.db, s.parent, now), s.studentId),
  ).toEqual({
    ok: true,
    value: {
      studentId: s.studentId,
      attendanceCount: 0,
      pendingAssignments: 1,
      lateSubmissions: 0,
    },
  });
  await store.db.guardianLink.update({
    where: {
      guardianId_studentId: {
        guardianId: s.parent.userId,
        studentId: s.studentId,
      },
    },
    data: { revokedAt: now },
  });
  expect(
    (
      await getLearningSummary(
        makeContext(store.db, s.parent, now),
        s.studentId,
      )
    ).ok,
  ).toBe(false);
});
