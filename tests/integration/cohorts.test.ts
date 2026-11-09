import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import {
  seedLearningScenario,
  systemContext,
  payOrder,
} from "../support/learning";
import { makeContext } from "../support/context";
import { completeOffering } from "../../src/modules/learning/completion";
import { startReenrollment } from "../../src/modules/learning/reenroll";
import {
  createNextCohort,
  publishOffering,
  updateOffering,
  createOffering,
} from "../../src/modules/catalog/authoring";
const finished = new Date("2030-01-01T02:11:00Z");
describe("owner-created same course cohorts", () => {
  let store: Awaited<ReturnType<typeof createTestDatabase>>,
    s: Awaited<ReturnType<typeof seedLearningScenario>>;
  beforeEach(async () => {
    store = await createTestDatabase();
    s = await seedLearningScenario(store.db);
    await completeOffering(systemContext(store.db, finished), s.offeringId);
  });
  afterEach(async () => {
    await store?.close();
  });
  const input = () => ({
    priceWon: 125000,
    capacity: 4,
    enrollmentOpensAt: "2030-01-01T00:00:00Z",
    enrollmentClosesAt: "2030-01-07T00:00:00Z",
    instructorIds: [s.teacher.userId],
    sessions: [
      { startsAt: "2030-01-08T01:00:00Z", endsAt: "2030-01-08T02:00:00Z" },
    ],
  });
  const owner = () => makeContext(store.db, s.owner, finished);
  async function create() {
    const result = await createNextCohort(owner(), s.offeringId, input());
    if (!result.ok) throw Error(result.code);
    return result.value.offeringId;
  }
  it("creates a new draft from exact course identity and enables a fresh current-price reenrollment order", async () => {
    const before = await store.db.offering.findUniqueOrThrow({
      where: { id: s.offeringId },
      include: { course: true, sessions: true, instructors: true },
    });
    const result = await createNextCohort(owner(), s.offeringId, input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = await store.db.offering.findUniqueOrThrow({
      where: { id: result.value.offeringId },
      include: { course: true, sessions: true, instructors: true },
    });
    expect(next.id).not.toBe(s.offeringId);
    expect(next.status).toBe("draft");
    expect(next.courseId).toBe(s.courseId);
    expect(next.course).toEqual(before.course);
    expect(next.priceWon).toBe(125000);
    expect(next.sessions[0].startsAt.toISOString()).toBe(
      "2030-01-08T01:00:00.000Z",
    );
    expect(next.instructors[0].userId).toBe(s.teacher.userId);
    const request = {
      enrollmentId: s.enrollmentId,
      nextOfferingId: next.id,
      requestKey: "next-cohort",
      consent: true as const,
    };
    expect(
      (
        await startReenrollment(
          makeContext(store.db, s.parent, finished),
          request,
        )
      ).ok,
    ).toBe(false);
    expect(await publishOffering(owner(), next.id)).toEqual({
      ok: true,
      value: undefined,
    });
    const ordered = await startReenrollment(
      makeContext(store.db, s.parent, finished),
      request,
    );
    expect(ordered.ok && ordered.value.amountWon).toBe(125000);
    if (!ordered.ok) return;
    expect(ordered.value.orderId).not.toBe(s.orderId);
    await payOrder(systemContext(store.db, finished), ordered.value.orderId);
    expect(
      (
        await store.db.enrollment.findUniqueOrThrow({
          where: { orderId: ordered.value.orderId },
        })
      ).offeringId,
    ).toBe(next.id);
    expect(
      await store.db.offering.findUniqueOrThrow({
        where: { id: s.offeringId },
        include: { course: true, sessions: true, instructors: true },
      }),
    ).toEqual(before);
  });
  it("rejects cross-academy owners, teachers, guardians and revoked owner membership", async () => {
    for (const actor of [s.otherOwner, s.teacher, s.parent])
      expect(
        await createNextCohort(
          makeContext(store.db, actor, finished),
          s.offeringId,
          input(),
        ),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
    await store.db.academyMembership.update({
      where: {
        academyId_userId: { academyId: s.academyId, userId: s.owner.userId },
      },
      data: { active: false },
    });
    expect(await createNextCohort(owner(), s.offeringId, input())).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await store.db.offering.count()).toBe(1);
  });
  it("rejects course identity overrides and reuses existing schedule and instructor validation", async () => {
    expect(
      await createNextCohort(owner(), s.offeringId, {
        ...input(),
        academyId: s.otherAcademyId,
      } as ReturnType<typeof input>),
    ).toEqual({ ok: false, code: "VALIDATION" });
    expect(
      await createNextCohort(owner(), s.offeringId, {
        ...input(),
        title: "injected title",
      } as ReturnType<typeof input>),
    ).toEqual({ ok: false, code: "VALIDATION" });
    expect(
      await createNextCohort(owner(), s.offeringId, {
        ...input(),
        enrollmentClosesAt: "2030-01-08T03:00:00Z",
      }),
    ).toEqual({ ok: false, code: "VALIDATION" });
    expect(
      await createNextCohort(owner(), s.offeringId, {
        ...input(),
        instructorIds: [s.otherTeacher.userId],
      }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await store.db.course.count()).toBe(1);
  });
  it("retains course identity on cohort-only draft edits and forks course attributes without altering the source", async () => {
    const id = await create(),
      course = await store.db.course.findUniqueOrThrow({
        where: { id: s.courseId },
      });
    const edit = {
      ...input(),
      academyId: s.academyId,
      title: course.title,
      subject: course.subject as "math",
      gradeMin: course.gradeMin,
      gradeMax: course.gradeMax,
      level: course.level as "beginner",
      priceWon: 150000,
    };
    expect((await updateOffering(owner(), id, edit)).ok).toBe(true);
    expect(
      (await store.db.offering.findUniqueOrThrow({ where: { id } })).courseId,
    ).toBe(s.courseId);
    expect(
      (await updateOffering(owner(), id, { ...edit, title: "다른 과정" })).ok,
    ).toBe(true);
    expect(
      (await store.db.offering.findUniqueOrThrow({ where: { id } })).courseId,
    ).not.toBe(s.courseId);
    expect(
      await store.db.course.findUniqueOrThrow({ where: { id: s.courseId } }),
    ).toEqual(course);
  });
  it("applies standard instructor schedule conflict checks when the next cohort is published", async () => {
    const course = await store.db.course.findUniqueOrThrow({
      where: { id: s.courseId },
    });
    const busy = await createOffering(owner(), {
      ...input(),
      academyId: s.academyId,
      title: course.title,
      subject: "math",
      gradeMin: course.gradeMin,
      gradeMax: course.gradeMax,
      level: "beginner",
    });
    if (!busy.ok) throw Error(busy.code);
    expect((await publishOffering(owner(), busy.value.offeringId)).ok).toBe(
      true,
    );
    await store.db.offering.update({
      where: { id: busy.value.offeringId },
      data: { status: "closed" },
    });
    const id = await create();
    expect(await publishOffering(owner(), id)).toEqual({
      ok: false,
      code: "CONFLICT",
    });
    expect(
      (await store.db.offering.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("draft");
  });
});
