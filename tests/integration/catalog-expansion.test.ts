import { beforeEach, afterEach, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import {
  createOffering,
  publishOffering,
  type CreateOfferingInput,
} from "../../src/modules/catalog/authoring";
import { searchOfferings } from "../../src/modules/catalog/search";
import { createChild } from "../../src/modules/identity/guardian-links";
let store: Awaited<ReturnType<typeof createTestDatabase>>,
  s: Awaited<ReturnType<typeof seedScenario>>;
beforeEach(async () => {
  store = await createTestDatabase();
  s = await seedScenario(store.db);
});
afterEach(async () => {
  await store?.close();
});
it.each(["programming", "ai_usage", "ai_certificate", "ai_agent"])(
  "새 과목 %s의 일반인 수업을 개설·공개·검색한다",
  async (subject) => {
    const now = new Date("2029-12-01T00:00:00Z");
    const result = await createOffering(makeContext(store.db, s.owner, now), {
      academyId: s.academyId,
      title: "합성 일반인 과정",
      subject: subject as CreateOfferingInput["subject"],
      gradeMin: 13,
      gradeMax: 13,
      level: "beginner",
      priceWon: 100000,
      capacity: 4,
      enrollmentOpensAt: "2029-11-01T00:00:00Z",
      enrollmentClosesAt: "2029-12-30T00:00:00Z",
      instructorIds: [s.teacher.userId],
      sessions: [
        { startsAt: "2030-01-05T01:00:00Z", endsAt: "2030-01-05T02:00:00Z" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.code);
    expect(
      (
        await publishOffering(
          makeContext(store.db, s.owner, now),
          result.value.offeringId,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await searchOfferings(
          { subject: subject as CreateOfferingInput["subject"], grade: 13 },
          store.db,
          now,
        )
      ).items.map((o) => o.id),
    ).toEqual([result.value.offeringId]);
    expect(
      (await searchOfferings({ grade: 12 }, store.db, now)).items,
    ).toHaveLength(0);
  },
);
it("일반인 학습자 분류도 저장하며 잘못된 대상과 과목은 DB에서 거부한다", async () => {
  const child = await createChild(makeContext(store.db, s.parent), {
    name: "합성 일반인",
    grade: 13,
  });
  expect(child.ok).toBe(true);
  await expect(
    store.db.course.update({
      where: { id: s.courseId },
      data: { subject: "unknown" },
    }),
  ).rejects.toThrow();
  await expect(
    store.db.course.update({
      where: { id: s.courseId },
      data: { gradeMax: 14 },
    }),
  ).rejects.toThrow();
  await expect(
    store.db.studentProfile.update({
      where: { id: s.studentId },
      data: { grade: 14 },
    }),
  ).rejects.toThrow();
});
