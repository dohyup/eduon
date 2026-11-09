import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import { createOrder } from "../../src/modules/enrollment/orders";
import { applyVerifiedPayment } from "../../src/modules/payments/confirm";
import { recordAttendance } from "../../src/modules/learning/attendance";
import { completeOffering } from "../../src/modules/learning/completion";
import {
  createReview,
  reportReview,
  resolveReport,
  listPublicReviews,
} from "../../src/modules/learning/reviews";
import { startReenrollment } from "../../src/modules/learning/reenroll";
describe("verified course reviews and reenrollment", () => {
  let store: Awaited<ReturnType<typeof createTestDatabase>>,
    s: Awaited<ReturnType<typeof seedScenario>>,
    enrollmentId: string;
  const purchase = new Date("2029-12-01T00:00:00Z"),
    finished = new Date("2030-01-01T02:11:00Z");
  beforeEach(async () => {
    store = await createTestDatabase();
    s = await seedScenario(store.db);
    await store.db.studentProfile.update({
      where: { id: s.studentId },
      data: { accountUserId: s.student.userId },
    });
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { status: "published" },
    });
    const o = await createOrder(makeContext(store.db, s.parent, purchase), {
      studentId: s.studentId,
      offeringId: s.offeringId,
      requestKey: "review",
      consent: true,
    });
    if (!o.ok) throw Error(o.code);
    const p = await applyVerifiedPayment(
      { db: store.db, now: () => purchase, source: "job" },
      {
        orderId: o.value.orderId,
        transactionId: o.value.orderId,
        amountWon: 100000,
        currency: "KRW",
        status: "paid",
        mode: "test",
      },
    );
    if (!p.ok) throw Error(p.code);
    enrollmentId = (
      await store.db.enrollment.findFirstOrThrow({
        where: { orderId: o.value.orderId },
      })
    ).id;
  });
  afterEach(async () => {
    await store?.close();
  });
  async function complete() {
    const a = await recordAttendance(
      makeContext(store.db, s.teacher, finished),
      {
        sessionId: s.sessionId,
        studentId: s.studentId,
        status: "present",
        reason: "수업 참여 확인",
      },
    );
    if (!a.ok) throw Error(a.code);
    await completeOffering(
      { db: store.db, now: () => finished, source: "job" },
      s.offeringId,
    );
  }
  it("rejects a completed enrollment without current verified payment evidence", async () => {
    await complete();
    await store.db.payment.updateMany({
      where: { order: { enrollment: { id: enrollmentId } } },
      data: { verifiedAt: null },
    });
    expect(
      (
        await createReview(makeContext(store.db, s.student, finished), {
          enrollmentId,
          rating: 5,
          text: "결제 검증 누락",
        })
      ).ok,
    ).toBe(false);
  });
  it("only completed enrollment's student or current paying guardian may review once", async () => {
    expect(
      (
        await createReview(makeContext(store.db, s.student, purchase), {
          enrollmentId,
          rating: 5,
          text: "참여 전",
        })
      ).ok,
    ).toBe(false);
    await complete();
    const r = await createReview(makeContext(store.db, s.student, finished), {
      enrollmentId,
      rating: 5,
      text: "설명이 이해하기 쉬웠어요",
    });
    expect(r.ok).toBe(true);
    expect(
      (
        await createReview(makeContext(store.db, s.parent, finished), {
          enrollmentId,
          rating: 4,
          text: "중복 후기",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await createReview(makeContext(store.db, s.otherParent, finished), {
          enrollmentId,
          rating: 5,
          text: "타인 후기",
        })
      ).ok,
    ).toBe(false);
  });
  it("revoked paying guardian and invalid ratings cannot publish", async () => {
    await complete();
    await store.db.guardianLink.update({
      where: {
        guardianId_studentId: {
          guardianId: s.parent.userId,
          studentId: s.studentId,
        },
      },
      data: { revokedAt: finished },
    });
    expect(
      (
        await createReview(makeContext(store.db, s.parent, finished), {
          enrollmentId,
          rating: 5,
          text: "연결 해제",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await createReview(makeContext(store.db, s.student, finished), {
          enrollmentId,
          rating: 6,
          text: "범위 밖",
        })
      ).ok,
    ).toBe(false);
  });
  it("reports require admin moderation with reason and public hiding", async () => {
    await complete();
    const r = await createReview(makeContext(store.db, s.student, finished), {
      enrollmentId,
      rating: 4,
      text: "확인할 후기",
    });
    if (!r.ok) throw Error(r.code);
    const report = await reportReview(
      makeContext(store.db, s.otherParent, finished),
      { reviewId: r.value.reviewId, reason: "운영 검토 요청" },
    );
    if (!report.ok) throw Error(report.code);
    expect(
      (
        await resolveReport(makeContext(store.db, s.teacher, finished), {
          reportId: report.value.reportId,
          action: "hide",
          reason: "권한 없음",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await resolveReport(makeContext(store.db, s.admin, finished), {
          reportId: report.value.reportId,
          action: "hide",
          reason: "운영 정책 위반 확인",
        })
      ).ok,
    ).toBe(true);
    expect(
      (await listPublicReviews(store.db, s.offeringId)).items,
    ).toHaveLength(0);
  });
  it("reenrollment creates a distinct current-price order for the same course", async () => {
    await complete();
    const next = await store.db.offering.create({
      data: {
        courseId: s.courseId,
        academyId: s.academyId,
        status: "published",
        priceWon: 120000,
        capacity: 4,
        enrollmentOpensAt: new Date("2029-01-01"),
        enrollmentClosesAt: new Date("2030-02-01"),
        sessions: {
          create: {
            startsAt: new Date("2030-02-02T01:00:00Z"),
            endsAt: new Date("2030-02-02T02:00:00Z"),
          },
        },
      },
    });
    const input = {
      enrollmentId,
      nextOfferingId: next.id,
      requestKey: "repeat",
      consent: true as const,
    };
    const r = await startReenrollment(
      makeContext(store.db, s.parent, finished),
      input,
    );
    expect(r.ok && r.value.amountWon).toBe(120000);
    const again = await startReenrollment(
      makeContext(store.db, s.parent, finished),
      input,
    );
    expect(again).toEqual(r);
    expect(
      (
        await startReenrollment(
          makeContext(store.db, s.otherParent, finished),
          { ...input, requestKey: "other" },
        )
      ).ok,
    ).toBe(false);
    expect(await store.db.order.count()).toBe(2);
  });
});
