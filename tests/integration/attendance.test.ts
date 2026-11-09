import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedLearningScenario, systemContext } from "../support/learning";
import { makeContext } from "../support/context";
import { recordAttendance } from "../../src/modules/learning/attendance";
import { completeOffering } from "../../src/modules/learning/completion";
import { requireLearningRead } from "../../src/modules/learning/access";
const at = new Date("2030-01-01T01:05:00Z");
describe("manual attendance and completion", () => {
  let store: Awaited<ReturnType<typeof createTestDatabase>>,
    s: Awaited<ReturnType<typeof seedLearningScenario>>;
  beforeEach(async () => {
    store = await createTestDatabase();
    s = await seedLearningScenario(store.db);
  });
  afterEach(async () => {
    await store?.close();
  });
  const input = () => ({
    sessionId: s.sessionId,
    studentId: s.studentId,
    status: "present" as const,
    reason: "수업 참여 확인",
  });
  it("records one attendance with immutable revision history for each instructor correction", async () => {
    expect(
      await recordAttendance(makeContext(store.db, s.teacher, at), input()),
    ).toEqual({ ok: true, value: undefined });
    expect(
      await recordAttendance(makeContext(store.db, s.teacher, at), {
        ...input(),
        status: "late",
        reason: "입장 시각 정정",
      }),
    ).toEqual({ ok: true, value: undefined });
    const rows = await store.db.attendance.findMany({
      include: { revisions: { orderBy: { createdAt: "asc" } } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("late");
    expect(rows[0].revisions.map((r) => r.status)).toEqual(["present", "late"]);
    expect(
      rows[0].revisions.every((r) => r.authorId === s.teacher.userId),
    ).toBe(true);
  });
  it("rejects owners, guardians, unassigned instructors, different students and future classes", async () => {
    for (const actor of [s.owner, s.parent, s.otherTeacher, s.student])
      expect(
        await recordAttendance(makeContext(store.db, actor, at), input()),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(
      await recordAttendance(makeContext(store.db, s.teacher, at), {
        ...input(),
        studentId: s.otherStudentId,
      }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(
      await recordAttendance(
        makeContext(store.db, s.teacher, new Date("2030-01-01T00:59:59Z")),
        input(),
      ),
    ).toEqual({ ok: false, code: "VALIDATION" });
  });
  it("blocks cancelled rights and requires a correction reason", async () => {
    expect(
      await recordAttendance(makeContext(store.db, s.teacher, at), {
        ...input(),
        reason: " ",
      }),
    ).toEqual({ ok: false, code: "VALIDATION" });
    await store.db.enrollmentSession.updateMany({
      where: { enrollmentId: s.enrollmentId },
      data: { status: "cancelled" },
    });
    expect(
      await recordAttendance(makeContext(store.db, s.teacher, at), input()),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
  });
  it("completes idempotently after all sessions end and never invents attendance", async () => {
    await completeOffering(systemContext(store.db, at), s.offeringId);
    expect(
      (
        await store.db.enrollment.findUniqueOrThrow({
          where: { id: s.enrollmentId },
        })
      ).status,
    ).toBe("active");
    const sys = systemContext(store.db, new Date("2030-01-01T02:11:00Z"));
    await completeOffering(sys, s.offeringId);
    await completeOffering(sys, s.offeringId);
    expect(
      (
        await store.db.enrollment.findUniqueOrThrow({
          where: { id: s.enrollmentId },
        })
      ).status,
    ).toBe("completed");
    expect(await store.db.attendance.count()).toBe(0);
    expect(
      (await store.db.enrollmentSession.findFirstOrThrow()).completedAt,
    ).toBeNull();
  });
  it("preserves verified completed history for linked guardians but rejects owners and revoked links", async () => {
    await completeOffering(
      systemContext(store.db, new Date("2030-01-01T02:11:00Z")),
      s.offeringId,
    );
    expect(
      (
        await requireLearningRead(
          makeContext(store.db, s.parent),
          s.offeringId,
          { studentId: s.studentId },
        )
      ).role,
    ).toBe("guardian");
    await expect(
      requireLearningRead(makeContext(store.db, s.owner), s.offeringId, {
        studentId: s.studentId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await store.db.guardianLink.update({
      where: {
        guardianId_studentId: {
          guardianId: s.parent.userId,
          studentId: s.studentId,
        },
      },
      data: { revokedAt: at },
    });
    await expect(
      requireLearningRead(makeContext(store.db, s.parent), s.offeringId, {
        studentId: s.studentId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("only marks participated allowed sessions completed and preserves cancelled enrollments", async () => {
    await recordAttendance(makeContext(store.db, s.teacher, at), {
      ...input(),
      status: "late",
    });
    const after = new Date("2030-01-01T02:11:00Z");
    await completeOffering(systemContext(store.db, after), s.offeringId);
    expect(
      (await store.db.enrollmentSession.findFirstOrThrow()).completedAt,
    ).toEqual(after);
    const cancelled = await seedLearningScenario(store.db);
    await store.db.enrollment.update({
      where: { id: cancelled.enrollmentId },
      data: { status: "cancelled" },
    });
    await store.db.enrollmentSession.updateMany({
      where: { enrollmentId: cancelled.enrollmentId },
      data: { status: "cancelled" },
    });
    await completeOffering(
      systemContext(store.db, after),
      cancelled.offeringId,
    );
    expect(
      (
        await store.db.enrollment.findUniqueOrThrow({
          where: { id: cancelled.enrollmentId },
        })
      ).status,
    ).toBe("cancelled");
    expect(
      (
        await store.db.enrollmentSession.findFirstOrThrow({
          where: { enrollmentId: cancelled.enrollmentId },
        })
      ).completedAt,
    ).toBeNull();
  });
  it("database rejects cross academy attendance and immutable revision edits", async () => {
    const other = await seedLearningScenario(store.db);
    await expect(
      store.db.attendance.create({
        data: {
          academyId: s.academyId,
          offeringId: s.offeringId,
          sessionId: other.sessionId,
          enrollmentId: s.enrollmentId,
          studentId: s.studentId,
          authorId: s.teacher.userId,
          status: "present",
          reason: "invalid cross tenant",
        },
      }),
    ).rejects.toThrow();
    await recordAttendance(makeContext(store.db, s.teacher, at), input());
    const row = await store.db.attendanceRevision.findFirstOrThrow();
    await expect(
      store.db.attendanceRevision.update({
        where: { id: row.id },
        data: { reason: "erase history" },
      }),
    ).rejects.toThrow();
  });
  it("retains the full inclusive join grace period before completing", async () => {
    await completeOffering(
      systemContext(store.db, new Date("2030-01-01T02:10:00Z")),
      s.offeringId,
    );
    expect(
      (
        await store.db.enrollment.findUniqueOrThrow({
          where: { id: s.enrollmentId },
        })
      ).status,
    ).toBe("active");
    await completeOffering(
      systemContext(store.db, new Date("2030-01-01T02:10:00.001Z")),
      s.offeringId,
    );
    expect(
      (
        await store.db.enrollment.findUniqueOrThrow({
          where: { id: s.enrollmentId },
        })
      ).status,
    ).toBe("completed");
  });
  it("allows assigned teachers to correct completed attendance and reconciles participation markers", async () => {
    await recordAttendance(makeContext(store.db, s.teacher, at), input());
    const after = new Date("2030-01-01T02:11:00Z");
    await completeOffering(systemContext(store.db, after), s.offeringId);
    expect(
      await recordAttendance(makeContext(store.db, s.teacher, after), {
        ...input(),
        status: "absent",
        reason: "출결 오입력 정정",
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(
      (await store.db.enrollmentSession.findFirstOrThrow()).completedAt,
    ).toBeNull();
    expect(
      await recordAttendance(makeContext(store.db, s.teacher, after), {
        ...input(),
        status: "present",
        reason: "참여 확인 후 정정",
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(
      (await store.db.enrollmentSession.findFirstOrThrow()).completedAt,
    ).toEqual(after);
    expect(await store.db.attendanceRevision.count()).toBe(3);
  });
});
