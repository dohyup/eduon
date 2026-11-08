import { beforeEach, afterEach, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import {
  canReadStudent,
  authorizeAcademy,
} from "../../src/modules/identity/access";
let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
let s: Awaited<ReturnType<typeof seedScenario>>;
beforeEach(async () => {
  testDb = await createTestDatabase();
  s = await seedScenario(testDb.db);
});
afterEach(async () => {
  await testDb?.close();
});
it("타 학원 원장은 학생 기록을 읽지 못한다", async () => {
  expect(
    await canReadStudent(makeContext(testDb.db, s.otherOwner), s.studentId),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
it("연결된 보호자만 자녀 프로필을 읽는다", async () => {
  expect(
    (await canReadStudent(makeContext(testDb.db, s.parent), s.studentId)).ok,
  ).toBe(true);
  expect(
    await canReadStudent(makeContext(testDb.db, s.otherParent), s.studentId),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
it("다른 학원과 해임된 강사의 소속 권한을 거부한다", async () => {
  expect(
    await authorizeAcademy(
      makeContext(testDb.db, s.otherOwner),
      s.academyId,
      "owner",
    ),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
  await testDb.db.academyMembership.updateMany({
    where: { userId: s.teacher.userId },
    data: { active: false },
  });
  expect(
    await authorizeAcademy(
      makeContext(testDb.db, s.teacher),
      s.academyId,
      "instructor",
    ),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
