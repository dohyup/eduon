import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import {
  submitAcademy,
  decideAcademy,
  listManagedAcademies,
} from "../../src/modules/academies/service";
import {
  issueInstructorInvitation,
  acceptInstructorInvitation,
} from "../../src/modules/academies/invitations";
import {
  createOffering,
  publishOffering,
  updateOffering,
  listManagedOfferings,
} from "../../src/modules/catalog/authoring";

describe("학원 승인과 수업 공개", () => {
  let store: Awaited<ReturnType<typeof createTestDatabase>>;
  let s: Awaited<ReturnType<typeof seedScenario>>;
  beforeEach(async () => {
    store = await createTestDatabase();
    s = await seedScenario(store.db);
  });
  afterEach(async () => {
    await store?.close();
  });
  const input = () => ({
    academyId: s.academyId,
    title: "합성 수학",
    subject: "math" as const,
    gradeMin: 4,
    gradeMax: 6,
    level: "beginner" as const,
    priceWon: 100000,
    capacity: 2,
    enrollmentOpensAt: "2029-01-01T00:00:00Z",
    enrollmentClosesAt: "2029-12-31T00:00:00Z",
    instructorIds: [s.teacher.userId],
    sessions: [
      { startsAt: "2030-02-01T01:00:00Z", endsAt: "2030-02-01T02:00:00Z" },
    ],
  });
  it("심사 중 학원과 권한 없는 원장의 공개를 거부한다", async () => {
    await store.db.academy.update({
      where: { id: s.academyId },
      data: { status: "submitted" },
    });
    expect(
      await publishOffering(makeContext(store.db, s.owner), s.offeringId),
    ).toEqual({ ok: false, code: "CONFLICT" });
    expect(
      await publishOffering(makeContext(store.db, s.otherOwner), s.offeringId),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
  });
  it("제출과 운영자의 승인/정지에 감사 이력을 남긴다", async () => {
    const ctx = makeContext(store.db, s.owner);
    const submitted = await submitAcademy(ctx, {
      name: "합성 새 학원",
      region: "서울",
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const academyId = submitted.value.academyId;
    expect(
      await decideAcademy(ctx, {
        academyId,
        decision: "approved",
        reason: "확인",
      }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    const admin = await store.db.user.create({
      data: { email: "admin@example.test", platformAdmin: true },
    });
    expect(
      (
        await decideAcademy(makeContext(store.db, { userId: admin.id }), {
          academyId,
          decision: "approved",
          reason: "합성 확인",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await decideAcademy(makeContext(store.db, { userId: admin.id }), {
          academyId,
          decision: "suspended",
          reason: "운영 점검",
        })
      ).ok,
    ).toBe(true);
    expect(
      await store.db.auditEvent.count({ where: { targetId: academyId } }),
    ).toBe(3);
    const managed = await listManagedAcademies(ctx);
    expect(
      managed.ok &&
        managed.value.some(
          (a) => a.id === academyId && a.status === "suspended",
        ),
    ).toBe(true);
  });
  it("반려된 학원을 같은 ID로 재제출하고 기존 반려 사유를 지운다", async () => {
    await store.db.academy.update({
      where: { id: s.academyId },
      data: { status: "rejected", decisionReason: "서류 보완" },
    });
    expect(
      await submitAcademy(makeContext(store.db, s.owner), {
        academyId: s.academyId,
        name: "합성 보완 학원",
        region: "서울",
      }),
    ).toEqual({ ok: true, value: { academyId: s.academyId } });
    expect(
      await store.db.academy.findUnique({ where: { id: s.academyId } }),
    ).toMatchObject({ status: "submitted", decisionReason: null });
  });
  it("강사 초대는 지정 계정이 한 번만 수락하고 토큰은 해시로 보관한다", async () => {
    const invited = await store.db.user.create({
      data: { email: "invited@example.test" },
    });
    const issued = await issueInstructorInvitation(
      makeContext(store.db, s.owner),
      { academyId: s.academyId, email: invited.email },
    );
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(
      await acceptInstructorInvitation(
        makeContext(store.db, s.otherTeacher),
        issued.value.token,
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    const ctx = makeContext(store.db, { userId: invited.id });
    expect((await acceptInstructorInvitation(ctx, issued.value.token)).ok).toBe(
      true,
    );
    expect(await acceptInstructorInvitation(ctx, issued.value.token)).toEqual({
      ok: false,
      code: "CONFLICT",
    });
    const stored = await store.db.instructorInvitation.findFirstOrThrow({
      where: { recipientEmail: invited.email },
    });
    expect(stored.tokenHash).not.toBe(issued.value.token);
    expect(
      await store.db.academyMembership.findUnique({
        where: {
          academyId_userId: { academyId: s.academyId, userId: invited.id },
        },
      }),
    ).toMatchObject({ role: "instructor", active: true });
  });
  it("만료/재발급 폐기된 초대를 거부하고 동시 수락을 한 번만 허용한다", async () => {
    const invited = await store.db.user.create({
      data: { email: "expiry@example.test" },
    });
    const owner = makeContext(store.db, s.owner),
      teacher = makeContext(store.db, { userId: invited.id });
    const expired = await issueInstructorInvitation(owner, {
      academyId: s.academyId,
      email: invited.email,
    });
    if (!expired.ok) throw new Error(expired.code);
    expect(
      await acceptInstructorInvitation(
        makeContext(
          store.db,
          { userId: invited.id },
          new Date("2029-12-02T00:00:00Z"),
        ),
        expired.value.token,
      ),
    ).toEqual({ ok: false, code: "EXPIRED" });
    const renewed = await issueInstructorInvitation(owner, {
      academyId: s.academyId,
      email: invited.email,
    });
    if (!renewed.ok) throw new Error(renewed.code);
    expect(
      await acceptInstructorInvitation(teacher, expired.value.token),
    ).toEqual({ ok: false, code: "CONFLICT" });
    const results = await Promise.all([
      acceptInstructorInvitation(teacher, renewed.value.token),
      acceptInstructorInvitation(teacher, renewed.value.token),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, code: "CONFLICT" },
    ]);
  });
  it("발급 원장의 권한이 철회되면 초대 수락을 거부한다", async () => {
    const invited = await store.db.user.create({
      data: { email: "former-owner@example.test" },
    });
    const issued = await issueInstructorInvitation(
      makeContext(store.db, s.owner),
      { academyId: s.academyId, email: invited.email },
    );
    if (!issued.ok) throw new Error(issued.code);
    await store.db.academyMembership.update({
      where: {
        academyId_userId: { academyId: s.academyId, userId: s.owner.userId },
      },
      data: { active: false },
    });
    expect(
      await acceptInstructorInvitation(
        makeContext(store.db, { userId: invited.id }),
        issued.value.token,
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(
      await store.db.academyMembership.findUnique({
        where: {
          academyId_userId: { academyId: s.academyId, userId: invited.id },
        },
      }),
    ).toBeNull();
  });
  it("타 학원 강사와 잘못된 회차는 저장되지 않는다", async () => {
    const ctx = makeContext(store.db, s.owner);
    expect(
      await createOffering(ctx, {
        ...input(),
        instructorIds: [s.otherTeacher.userId],
      }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(
      await createOffering(ctx, {
        ...input(),
        sessions: [
          { startsAt: "2030-02-01T02:00:00Z", endsAt: "2030-02-01T01:00:00Z" },
        ],
      }),
    ).toEqual({ ok: false, code: "VALIDATION" });
    expect(await store.db.offering.count()).toBe(1);
  });
  it("동시에 겹치는 수업 두 개를 공개하면 한 개만 성공한다", async () => {
    const ctx = makeContext(store.db, s.owner);
    const a = await createOffering(ctx, input());
    const b = await createOffering(ctx, input());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const results = await Promise.all([
      publishOffering(ctx, a.value.offeringId),
      publishOffering(ctx, b.value.offeringId),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, code: "CONFLICT" },
    ]);
  });
  it("두 학원에 소속된 강사의 겹치는 공개도 직렬화한다", async () => {
    await store.db.academyMembership.create({
      data: {
        academyId: s.otherAcademyId,
        userId: s.teacher.userId,
        role: "instructor",
      },
    });
    const a = await createOffering(makeContext(store.db, s.owner), input());
    const b = await createOffering(makeContext(store.db, s.otherOwner), {
      ...input(),
      academyId: s.otherAcademyId,
    });
    if (!a.ok || !b.ok) throw new Error("create failed");
    const results = await Promise.all([
      publishOffering(makeContext(store.db, s.owner), a.value.offeringId),
      publishOffering(makeContext(store.db, s.otherOwner), b.value.offeringId),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, code: "CONFLICT" },
    ]);
  });
  it("첫 구매 후 가격/회차 수정과 타 학원 수정을 거부한다", async () => {
    const ctx = makeContext(store.db, s.owner);
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { status: "draft", purchaseLockedAt: new Date() },
    });
    expect(
      await updateOffering(ctx, s.offeringId, { ...input(), priceWon: 200000 }),
    ).toEqual({ ok: false, code: "CONFLICT" });
    expect(
      await updateOffering(
        makeContext(store.db, s.otherOwner),
        s.offeringId,
        input(),
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    const list = await listManagedOfferings(
      makeContext(store.db, s.otherTeacher),
    );
    expect(list.ok && list.value.some((o) => o.id === s.offeringId)).toBe(
      false,
    );
    const teacherList = await listManagedOfferings(
      makeContext(store.db, s.teacher),
    );
    expect(
      teacherList.ok && teacherList.value.some((o) => o.id === s.offeringId),
    ).toBe(true);
    expect(
      teacherList.ok && teacherList.value[0].instructors[0].instructor.email,
    ).toBeUndefined();
  });
  it("구매 고정 후 제목 수정은 기존 회차 ID를 보존한다", async () => {
    const created = await createOffering(
      makeContext(store.db, s.owner),
      input(),
    );
    if (!created.ok) throw new Error(created.code);
    const offeringId = created.value.offeringId;
    await store.db.offering.update({
      where: { id: offeringId },
      data: { purchaseLockedAt: new Date() },
    });
    const before = await store.db.session.findMany({ where: { offeringId } });
    expect(
      (
        await updateOffering(makeContext(store.db, s.owner), offeringId, {
          ...input(),
          title: "합성 제목 보완",
        })
      ).ok,
    ).toBe(true);
    const after = await store.db.session.findMany({ where: { offeringId } });
    expect(after.map((session) => session.id)).toEqual(
      before.map((session) => session.id),
    );
  });
  it("원장 수업 목록의 다음 페이지를 같은 학원 범위에서 조회한다", async () => {
    const createdAt = new Date("2029-01-01T00:00:00Z");
    await store.db.offering.createMany({
      data: Array.from({ length: 22 }, () => ({
        academyId: s.academyId,
        courseId: s.courseId,
        priceWon: 100000,
        capacity: 2,
        enrollmentOpensAt: new Date("2029-01-01T00:00:00Z"),
        enrollmentClosesAt: new Date("2029-12-31T00:00:00Z"),
        createdAt,
      })),
    });
    const foreignCourse = await store.db.course.create({
      data: {
        academyId: s.otherAcademyId,
        title: "다른 학원 수학",
        subject: "math",
        gradeMin: 4,
        gradeMax: 6,
        level: "beginner",
      },
    });
    const foreign = await store.db.offering.create({
      data: {
        academyId: s.otherAcademyId,
        courseId: foreignCourse.id,
        priceWon: 100000,
        capacity: 2,
        enrollmentOpensAt: createdAt,
        enrollmentClosesAt: new Date("2029-12-31T00:00:00Z"),
        createdAt,
      },
    });
    const ctx = makeContext(store.db, s.owner);
    const first = await listManagedOfferings(ctx);
    if (!first.ok) throw new Error(first.code);
    expect(first.value).toHaveLength(20);
    const second = await listManagedOfferings(ctx, first.value[19].id);
    if (!second.ok) throw new Error(second.code);
    expect(second.value).toHaveLength(3);
    expect(
      new Set([...first.value, ...second.value].map((o) => o.id)).size,
    ).toBe(23);
    expect(second.value.every((o) => o.academyId === s.academyId)).toBe(true);
    const forged = await listManagedOfferings(ctx, foreign.id);
    if (!forged.ok) throw new Error(forged.code);
    expect(forged.value.every((o) => o.academyId === s.academyId)).toBe(true);
    expect(forged.value.some((o) => o.id === foreign.id)).toBe(false);
    expect(await listManagedOfferings(ctx, "invalid")).toEqual({
      ok: false,
      code: "VALIDATION",
    });
  });
  it("학원 목록의 다음 페이지는 소속 필터와 운영자 범위를 유지한다", async () => {
    const createdAt = new Date("2029-01-01T00:00:00Z");
    for (let i = 0; i < 22; i++)
      await store.db.academy.create({
        data: {
          name: `합성 학원 ${i}`,
          region: "서울",
          createdAt,
          memberships: { create: { userId: s.owner.userId, role: "owner" } },
        },
      });
    const ctx = makeContext(store.db, s.owner);
    const first = await listManagedAcademies(ctx);
    if (!first.ok) throw new Error(first.code);
    expect(first.value).toHaveLength(20);
    const second = await listManagedAcademies(ctx, first.value[19].id);
    if (!second.ok) throw new Error(second.code);
    expect(second.value).toHaveLength(3);
    expect(
      new Set([...first.value, ...second.value].map((a) => a.id)).size,
    ).toBe(23);
    const forged = await listManagedAcademies(ctx, s.otherAcademyId);
    if (!forged.ok) throw new Error(forged.code);
    expect(forged.value.some((a) => a.id === s.otherAcademyId)).toBe(false);
    expect(await listManagedAcademies(ctx, "invalid")).toEqual({
      ok: false,
      code: "VALIDATION",
    });
    const adminFirst = await listManagedAcademies(
      makeContext(store.db, s.admin),
    );
    if (!adminFirst.ok) throw new Error(adminFirst.code);
    const adminSecond = await listManagedAcademies(
      makeContext(store.db, s.admin),
      adminFirst.value[19].id,
    );
    if (!adminSecond.ok) throw new Error(adminSecond.code);
    expect(
      new Set([...adminFirst.value, ...adminSecond.value].map((a) => a.id))
        .size,
    ).toBe(24);
    expect(
      [...adminFirst.value, ...adminSecond.value].some(
        (a) => a.id === s.otherAcademyId,
      ),
    ).toBe(true);
  });
});
