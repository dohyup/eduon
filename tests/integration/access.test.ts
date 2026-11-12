import { beforeEach, afterEach, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import {
  canReadStudent,
  authorizeAcademy,
} from "../../src/modules/identity/access";
import {
  listPlatformAdmins,
  managePlatformAdminByEmail,
} from "../../src/modules/identity/operators";
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
it("플랫폼 관리자는 이메일로 관리자를 추가·변경(교체)·해제할 수 있고 마지막 1인 해제는 차단된다", async () => {
  const adminUser = await testDb.db.user.findUniqueOrThrow({
    where: { id: s.admin.userId },
  });
  const ownerUser = await testDb.db.user.findUniqueOrThrow({
    where: { id: s.owner.userId },
  });

  // 비관리자 호출 거부
  expect(
    await managePlatformAdminByEmail(makeContext(testDb.db, s.owner), {
      action: "grant",
      email: ownerUser.email,
      reason: "불법 권한 상승 시도",
    }),
  ).toEqual({ ok: false, code: "FORBIDDEN" });

  // 마지막 1인 관리자 해제 시도 차단 (CONFLICT)
  expect(
    await managePlatformAdminByEmail(makeContext(testDb.db, s.admin), {
      action: "revoke",
      email: adminUser.email,
      reason: "유일한 관리자 해제 시도",
    }),
  ).toEqual({ ok: false, code: "CONFLICT" });

  // 기존 관리자 이메일을 새 이메일(ownerUser.email)로 변경(replace)
  const replaced = await managePlatformAdminByEmail(
    makeContext(testDb.db, s.admin),
    {
      action: "replace",
      previousEmail: adminUser.email,
      email: ownerUser.email,
      reason: "운영 담당자 이메일 계정 교체",
    },
  );
  expect(replaced.ok).toBe(true);

  const listAfterReplace = await listPlatformAdmins(
    makeContext(testDb.db, s.owner),
  );
  expect(listAfterReplace.ok).toBe(true);
  if (listAfterReplace.ok) {
    expect(listAfterReplace.value.admins.map((a) => a.email)).toEqual([
      ownerUser.email,
    ]);
  }
});
