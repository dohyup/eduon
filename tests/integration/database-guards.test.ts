import { beforeEach, afterEach, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { rateLimit } from "../../src/server/rate-limit";
let store: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  store = await createTestDatabase();
});
afterEach(async () => {
  await store?.close();
});
it("외래키가 회차의 학원 바꿔치기를 차단한다", async () => {
  const s = await seedScenario(store.db);
  await expect(
    store.db.session.create({
      data: {
        academyId: s.otherAcademyId,
        offeringId: s.offeringId,
        startsAt: new Date("2030-01-01"),
        endsAt: new Date("2030-01-02"),
      },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
});
it("공개 스키마의 모든 앱 테이블은 RLS가 켜져 있다", async () => {
  const schema = new URL(store.url).searchParams.get("schema")!;
  const rows = await store.db.$queryRaw<
    { safe: boolean }[]
  >`SELECT bool_and(c.relrowsecurity) AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${schema} AND c.relkind='r'`;
  expect(rows[0].safe).toBe(true);
});
it("공유 레이트리밋은 동시 요청에서도 상한을 지킨다", async () => {
  const now = new Date("2030-01-01");
  const outcomes = await Promise.allSettled(
    Array.from({ length: 5 }, () => rateLimit(store.db, "same-user", 2, now)),
  );
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(2);
});
