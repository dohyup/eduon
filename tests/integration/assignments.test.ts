import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { seedLearning } from "../support/learning";
import { makeContext } from "../support/context";
import {
  createAssignment,
  submitAssignment,
  saveFeedback,
  listSubmissions,
} from "../../src/modules/learning/assignments";
import { listAssignments } from "../../src/modules/learning/assignments";

let store: Awaited<ReturnType<typeof createTestDatabase>>;
let s: Awaited<ReturnType<typeof seedScenario>>;
const due = new Date("2029-12-01T00:00:00Z");
beforeEach(async () => {
  store = await createTestDatabase();
  s = await seedScenario(store.db);
  await store.db.session.create({
    data: {
      academyId: s.academyId,
      offeringId: s.offeringId,
      startsAt: new Date("2030-01-02T01:00:00Z"),
      endsAt: new Date("2030-01-02T02:00:00Z"),
    },
  });
  await seedLearning(store.db, s);
});
afterEach(async () => {
  await store?.close();
});
async function assignment() {
  const result = await createAssignment(makeContext(store.db, s.teacher), {
    offeringId: s.offeringId,
    title: "분수",
    instructions: "풀이",
    dueAt: due.toISOString(),
  });
  if (!result.ok) throw Error(result.code);
  return result.value.assignmentId;
}
it("denies guardian submissions and owner content creation without assigned teaching membership", async () => {
  const id = await assignment();
  expect(
    await submitAssignment(makeContext(store.db, s.parent), {
      assignmentId: id,
      text: "답안",
      fileIds: [],
    }),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
  expect(
    await createAssignment(makeContext(store.db, s.owner), {
      offeringId: s.offeringId,
      title: "x",
      instructions: "",
      dueAt: due.toISOString(),
    }),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
it("preserves immutable monotonic versions and marks only strictly-after due time late", async () => {
  const id = await assignment();
  const first = await submitAssignment(makeContext(store.db, s.student, due), {
    assignmentId: id,
    text: "first",
    fileIds: [],
  });
  expect(first.ok && first.value).toMatchObject({ version: 1, late: false });
  const results = await Promise.all(
    ["second", "third"].map((text) =>
      submitAssignment(
        makeContext(store.db, s.student, new Date(due.getTime() + 1)),
        { assignmentId: id, text, fileIds: [] },
      ),
    ),
  );
  expect(results.every((r) => r.ok)).toBe(true);
  const rows = await store.db.submission.findMany({
    where: { assignmentId: id },
    orderBy: { version: "asc" },
  });
  expect(rows.map((r) => [r.version, r.late])).toEqual([
    [1, false],
    [2, true],
    [3, true],
  ]);
  expect(rows[0].text).toBe("first");
});
it("appends feedback, scopes guardian reads and rejects revoked or unverified guardians", async () => {
  const id = await assignment();
  const submitted = await submitAssignment(makeContext(store.db, s.student), {
    assignmentId: id,
    text: "answer",
    fileIds: [],
  });
  if (!submitted.ok) throw Error(submitted.code);
  for (const text of ["first feedback", "revised feedback"])
    expect(
      (
        await saveFeedback(makeContext(store.db, s.teacher), {
          submissionId: submitted.value.submissionId,
          text,
        })
      ).ok,
    ).toBe(true);
  const visible = await listSubmissions(makeContext(store.db, s.parent), {
    assignmentId: id,
    studentId: s.studentId,
  });
  expect(visible.ok && visible.value[0].feedback.map((f) => f.text)).toEqual([
    "first feedback",
    "revised feedback",
  ]);
  expect(
    await listSubmissions(makeContext(store.db, s.otherParent), {
      assignmentId: id,
      studentId: s.studentId,
    }),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
  await store.db.user.update({
    where: { id: s.parent.userId },
    data: { guardianVerifiedAt: null },
  });
  expect(
    await listSubmissions(makeContext(store.db, s.parent), {
      assignmentId: id,
      studentId: s.studentId,
    }),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
it("validates text, file count, distinct files and rejects guardian feedback writes", async () => {
  const id = await assignment();
  for (const input of [
    { text: "x".repeat(10001), fileIds: [] },
    { text: "x", fileIds: Array.from({ length: 6 }, () => s.sessionId) },
    { text: "", fileIds: [] },
  ])
    expect(
      await submitAssignment(makeContext(store.db, s.student), {
        assignmentId: id,
        ...input,
      }),
    ).toEqual({ ok: false, code: "VALIDATION" });
  const result = await submitAssignment(makeContext(store.db, s.student), {
    assignmentId: id,
    text: "answer",
    fileIds: [],
  });
  if (!result.ok) throw Error(result.code);
  expect(
    await saveFeedback(makeContext(store.db, s.parent), {
      submissionId: result.value.submissionId,
      text: "forged feedback",
    }),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
it("accepts late submissions after course completion while preserving paid allowed rights", async () => {
  const id = await assignment();
  await store.db.enrollment.updateMany({
    where: { offeringId: s.offeringId, studentId: s.studentId },
    data: { status: "completed" },
  });
  const result = await submitAssignment(
    makeContext(store.db, s.student, new Date("2030-02-01T00:00:00Z")),
    { assignmentId: id, text: "late after course", fileIds: [] },
  );
  expect(result.ok && result.value.late).toBe(true);
  await store.db.enrollmentSession.updateMany({
    where: { enrollment: { offeringId: s.offeringId } },
    data: { status: "cancelled" },
  });
  expect(
    await submitAssignment(makeContext(store.db, s.student), {
      assignmentId: id,
      text: "after refund",
      fileIds: [],
    }),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
it("bounds nested feedback history to the latest twenty revisions", async () => {
  const id = await assignment();
  const submitted = await submitAssignment(makeContext(store.db, s.student), {
    assignmentId: id,
    text: "answer",
    fileIds: [],
  });
  if (!submitted.ok) throw Error(submitted.code);
  await store.db.feedback.createMany({
    data: Array.from({ length: 25 }, (_, index) => ({
      academyId: s.academyId,
      offeringId: s.offeringId,
      submissionId: submitted.value.submissionId,
      authorId: s.teacher.userId,
      version: index + 1,
      text: `revision ${index + 1}`,
    })),
  });
  const result = await listSubmissions(makeContext(store.db, s.parent), {
    assignmentId: id,
    studentId: s.studentId,
  });
  expect(result.ok && result.value[0].feedback.length).toBe(20);
  expect(result.ok && result.value[0].feedback[0].text).toBe("revision 6");
});
it("filters revoked session content before pagination so older eligible assignments remain reachable", async () => {
  const id = await assignment();
  await store.db.assignment.createMany({
    data: Array.from({ length: 20 }, (_, index) => ({
      academyId: s.academyId,
      offeringId: s.offeringId,
      sessionId: s.sessionId,
      createdById: s.teacher.userId,
      title: `cancelled ${index}`,
      instructions: "",
      dueAt: due,
      createdAt: new Date(due.getTime() + 1000),
    })),
  });
  await store.db.enrollmentSession.updateMany({
    where: { sessionId: s.sessionId },
    data: { status: "refund_pending" },
  });
  const result = await listAssignments(makeContext(store.db, s.student), {
    offeringId: s.offeringId,
  });
  expect(result.ok && result.value.map((row) => row.id)).toEqual([id]);
});
it("bounds assignment keyset pages and never returns another student's answers to a guardian", async () => {
  const id = await assignment();
  await store.db.assignment.createMany({
    data: Array.from({ length: 22 }, (_, index) => ({
      academyId: s.academyId,
      offeringId: s.offeringId,
      createdById: s.teacher.userId,
      title: `item ${index}`,
      instructions: "",
      dueAt: due,
    })),
  });
  const first = await listAssignments(makeContext(store.db, s.parent), {
    offeringId: s.offeringId,
    studentId: s.studentId,
  });
  expect(first.ok && first.value.length).toBe(20);
  if (!first.ok) throw Error(first.code);
  const second = await listAssignments(makeContext(store.db, s.parent), {
    offeringId: s.offeringId,
    studentId: s.studentId,
    cursor: first.value[19].id,
  });
  expect(second.ok && second.value.length).toBe(3);
  const otherAccount = await store.db.user.create({
    data: { email: `second-${id}@example.test` },
  });
  await seedLearning(store.db, {
    ...s,
    studentId: s.otherStudentId,
    student: { userId: otherAccount.id },
    parent: s.otherParent,
  });
  const other = await submitAssignment(
    makeContext(store.db, { userId: otherAccount.id }),
    { assignmentId: id, text: "secret other answer", fileIds: [] },
  );
  expect(other.ok).toBe(true);
  const own = await submitAssignment(makeContext(store.db, s.student), {
    assignmentId: id,
    text: "own answer",
    fileIds: [],
  });
  expect(own.ok).toBe(true);
  const listed = await listSubmissions(makeContext(store.db, s.parent), {
    assignmentId: id,
    studentId: s.studentId,
  });
  expect(listed.ok && listed.value.map((row) => row.text)).toEqual([
    "own answer",
  ]);
  expect(
    await listSubmissions(makeContext(store.db, s.student), {
      assignmentId: id,
      studentId: s.otherStudentId,
    }),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
