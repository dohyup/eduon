import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import { searchOfferings } from "../../src/modules/catalog/search";
import { recommend } from "../../src/modules/recommendations/service";

describe("DB 공개 검색과 추천", () => {
  let store: Awaited<ReturnType<typeof createTestDatabase>>;
  let s: Awaited<ReturnType<typeof seedScenario>>;
  const now = new Date("2029-06-01T00:00:00Z");
  beforeEach(async () => {
    store = await createTestDatabase();
    s = await seedScenario(store.db);
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: {
        status: "published",
        enrollmentOpensAt: new Date("2029-01-01T00:00:00Z"),
        enrollmentClosesAt: new Date("2029-12-31T00:00:00Z"),
      },
    });
  });
  afterEach(async () => {
    await store?.close();
  });
  it("공개 승인 모집 기간과 잔여 정원을 모두 검사한다", async () => {
    expect(
      (await searchOfferings({}, store.db, now)).items.map((o) => o.id),
    ).toEqual([s.offeringId]);
    await store.db.academy.update({
      where: { id: s.academyId },
      data: { status: "suspended" },
    });
    expect((await searchOfferings({}, store.db, now)).items).toEqual([]);
    await store.db.academy.update({
      where: { id: s.academyId },
      data: { status: "approved" },
    });
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { status: "draft" },
    });
    expect((await searchOfferings({}, store.db, now)).items).toEqual([]);
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { status: "published", enrollmentClosesAt: now },
    });
    expect((await searchOfferings({}, store.db, now)).items).toEqual([]);
  });
  it("활성 수강만 좌석에서 차감하고 학생 정보를 노출하지 않는다", async () => {
    await store.db.enrollment.create({
      data: {
        offeringId: s.offeringId,
        studentId: s.studentId,
        status: "active",
      },
    });
    const result = await searchOfferings({}, store.db, now);
    expect(result.items[0].availableSeats).toBe(1);
    expect(JSON.stringify(result)).not.toContain("student");
    await store.db.enrollment.create({
      data: {
        offeringId: s.offeringId,
        studentId: s.otherStudentId,
        status: "active",
      },
    });
    expect((await searchOfferings({}, store.db, now)).items).toEqual([]);
  });
  it("학년/예산과 모든 회차의 시간을 적용한다", async () => {
    expect((await searchOfferings({ grade: 12 }, store.db, now)).items).toEqual(
      [],
    );
    expect(
      (await searchOfferings({ maxPriceWon: 1 }, store.db, now)).items,
    ).toEqual([]);
    expect(
      (
        await searchOfferings(
          {
            availableWindows: [
              {
                startsAt: "2030-01-01T01:00:00Z",
                endsAt: "2030-01-01T01:30:00Z",
              },
            ],
          },
          store.db,
          now,
        )
      ).items,
    ).toEqual([]);
  });
  it("잘못된 커서는 DB UUID 오류를 만들지 않는다", async () => {
    expect(
      await searchOfferings({ cursor: "-".repeat(36) }, store.db, now),
    ).toEqual({ items: [], nextCursor: null });
  });
  it("페이지는 20개이며 다음 커서는 중복과 누락이 없다", async () => {
    const base = await store.db.offering.findUniqueOrThrow({
      where: { id: s.offeringId },
    });
    for (let i = 0; i < 22; i++)
      await store.db.offering.create({
        data: {
          academyId: base.academyId,
          courseId: base.courseId,
          status: "published",
          capacity: 2,
          priceWon: 100000,
          enrollmentOpensAt: base.enrollmentOpensAt,
          enrollmentClosesAt: base.enrollmentClosesAt,
          sessions: {
            create: {
              startsAt: new Date("2030-02-01T01:00:00Z"),
              endsAt: new Date("2030-02-01T02:00:00Z"),
            },
          },
        },
      });
    const first = await searchOfferings({}, store.db, now);
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const second = await searchOfferings(
      { cursor: first.nextCursor! },
      store.db,
      now,
    );
    expect(second.items).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((o) => o.id)).size,
    ).toBe(23);
  });
  it("추천 기록은 후보 ID와 규칙 버전만 보관한다", async () => {
    const result = await recommend(makeContext(store.db, s.parent, now), {});
    expect(result.ok && result.value.map((r) => r.offering.id)).toEqual([
      s.offeringId,
    ]);
    expect(await store.db.recommendationEvent.findFirst()).toMatchObject({
      actorId: s.parent.userId,
      candidateIds: [s.offeringId],
      ruleVersion: "rules-v1",
    });
  });
  it("검색 스캔 예산을 소진하면 빈 페이지도 다음 커서를 반환한다", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      academyId: s.academyId,
      courseId: s.courseId,
      status: "published",
      priceWon: 100000,
      capacity: 1,
      enrollmentOpensAt: new Date("2029-01-01T00:00:00Z"),
      enrollmentClosesAt: new Date("2029-12-31T00:00:00Z"),
    }));
    await store.db.offering.createMany({ data: rows });
    await store.db.enrollment.createMany({
      data: rows.map((row) => ({
        offeringId: row.id,
        studentId: s.studentId,
        status: "active",
      })),
    });
    const first = await searchOfferings({}, store.db, now);
    expect(first).toEqual({
      items: [],
      nextCursor: "00000000-0000-4000-8000-000000000199",
    });
    const second = await searchOfferings(
      { cursor: first.nextCursor! },
      store.db,
      now,
    );
    expect(second.items.map((o) => o.id)).toEqual([s.offeringId]);
    expect(second.nextCursor).toBeNull();
  });
  it("추천은 다섯 검색 페이지만 평가한다", async () => {
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { status: "draft" },
    });
    const rows = Array.from({ length: 101 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      academyId: s.academyId,
      courseId: s.courseId,
      status: "published",
      priceWon: i === 100 ? 0 : 100000,
      capacity: 2,
      enrollmentOpensAt: new Date("2029-01-01T00:00:00Z"),
      enrollmentClosesAt: new Date("2029-12-31T00:00:00Z"),
    }));
    await store.db.offering.createMany({ data: rows });
    await store.db.session.createMany({
      data: rows.map((row) => ({
        offeringId: row.id,
        academyId: s.academyId,
        startsAt: new Date("2030-01-01T01:00:00Z"),
        endsAt: new Date("2030-01-01T02:00:00Z"),
      })),
    });
    const result = await recommend(makeContext(store.db, s.parent, now), {});
    if (!result.ok) throw new Error(result.code);
    expect(result.value.map((r) => r.offering.id)).toEqual(
      rows.slice(0, 5).map((r) => r.id),
    );
    expect(result.value.some((r) => r.offering.priceWon === 0)).toBe(false);
  });
});
