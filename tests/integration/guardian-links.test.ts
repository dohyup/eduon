import { beforeEach, afterEach, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import {
  createChild,
  issueStudentInvitation,
  acceptStudentInvitation,
  revokeStudentInvitation,
} from "../../src/modules/identity/guardian-links";
let t: Awaited<ReturnType<typeof createTestDatabase>>;
let s: Awaited<ReturnType<typeof seedScenario>>;
beforeEach(async () => {
  t = await createTestDatabase();
  s = await seedScenario(t.db);
});
afterEach(async () => {
  await t?.close();
});
async function issue() {
  const user = await t.db.user.findUniqueOrThrow({
    where: { id: s.student.userId },
  });
  const r = await issueStudentInvitation(
    makeContext(t.db, s.parent),
    s.studentId,
    user.email,
  );
  if (!r.ok) throw new Error(r.code);
  return r.value;
}
it("이메일 확인만으로 보호자 확인을 우회할 수 없다", async () => {
  const r = await createChild(makeContext(t.db, s.owner), {
    name: "가상 자녀",
    grade: 5,
  });
  expect(r).toEqual({ ok: false, code: "FORBIDDEN" });
});
it("초대는 수신 계정에 바인딩되고 한 번만 수락된다", async () => {
  const inv = await issue();
  expect(
    await acceptStudentInvitation(makeContext(t.db, s.otherParent), inv.token),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
  expect(
    (await acceptStudentInvitation(makeContext(t.db, s.student), inv.token)).ok,
  ).toBe(true);
  expect(
    await acceptStudentInvitation(makeContext(t.db, s.student), inv.token),
  ).toEqual({ ok: false, code: "CONFLICT" });
});
it("동시 수락에서도 한 번만 계정이 연결된다", async () => {
  const inv = await issue();
  const results = await Promise.all([
    acceptStudentInvitation(makeContext(t.db, s.student), inv.token),
    acceptStudentInvitation(makeContext(t.db, s.student), inv.token),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
});
it("만료·폐기 초대를 거부한다", async () => {
  const inv = await issue();
  expect(
    await acceptStudentInvitation(
      makeContext(t.db, s.student, new Date("2029-12-03")),
      inv.token,
    ),
  ).toEqual({ ok: false, code: "EXPIRED" });
  await revokeStudentInvitation(makeContext(t.db, s.parent), inv.invitationId);
  expect(
    await acceptStudentInvitation(makeContext(t.db, s.student), inv.token),
  ).toEqual({ ok: false, code: "CONFLICT" });
});
it("재발급 시 이전 토큰을 폐기하고 토큰 원문을 DB에 저장하지 않는다", async () => {
  const a = await issue();
  const b = await issue();
  const row = await t.db.studentInvitation.findUniqueOrThrow({
    where: { id: b.invitationId },
  });
  expect(row.tokenHash).not.toBe(b.token);
  expect(
    await acceptStudentInvitation(makeContext(t.db, s.student), a.token),
  ).toEqual({ ok: false, code: "CONFLICT" });
});
it("해제된 보호자 관계가 과거 초대를 계속 승인하지 못한다", async () => {
  const inv = await issue();
  await t.db.guardianLink.updateMany({
    where: { guardianId: s.parent.userId },
    data: { revokedAt: new Date() },
  });
  expect(
    await acceptStudentInvitation(makeContext(t.db, s.student), inv.token),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
