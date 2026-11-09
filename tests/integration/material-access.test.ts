import { afterEach, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { seedLearning } from "../support/learning";
import { makeContext } from "../support/context";
import { FakeStorageProvider } from "../support/fake-storage";
import {
  uploadMaterial,
  getMaterialDownload,
  deleteMaterial,
  listMaterials,
} from "../../src/modules/learning/materials";
import {
  createAssignment,
  submitAssignment,
} from "../../src/modules/learning/assignments";
let store: Awaited<ReturnType<typeof createTestDatabase>>;
let s: Awaited<ReturnType<typeof seedScenario>>;
let storage: FakeStorageProvider;
const pdf = Buffer.from("%PDF-1.7\nhello");
beforeEach(async () => {
  process.env.AUTH_PROVIDER = "test";
  process.env.STORAGE_PROVIDER = "fake";
  process.env.E2E_AUTH_SECRET =
    "storage-isolated-tests-long-authentication-secret";
  store = await createTestDatabase();
  s = await seedScenario(store.db);
  await store.db.session.create({
    data: {
      academyId: s.academyId,
      offeringId: s.offeringId,
      startsAt: new Date("2030-01-02T01:00:00Z"),
      endsAt: new Date("2030-01-02T02:00:00Z"),
    },
  });
  await seedLearning(store.db, s);
  storage = new FakeStorageProvider();
});
afterEach(async () => {
  await store?.close();
});
const upload = (
  purpose: "material" | "submission" = "material",
  scanner = storage,
) =>
  uploadMaterial(
    makeContext(store.db, purpose === "material" ? s.teacher : s.student),
    {
      offeringId: s.offeringId,
      filename: "lesson.pdf",
      mime: "application/pdf",
      data: pdf,
      purpose,
    },
    { storage, scanner },
  );
it("quarantines unscanned files and signs clean authorized materials with no key leakage", async () => {
  const quarantined = await uploadMaterial(
    makeContext(store.db, s.teacher),
    {
      offeringId: s.offeringId,
      filename: "lesson.pdf",
      mime: "application/pdf",
      data: pdf,
      purpose: "material",
    },
    { storage, scanner: { scan: async () => "unavailable" } },
  );
  if (!quarantined.ok) throw Error(quarantined.code);
  expect(quarantined.value.scanStatus).toBe("quarantined");
  expect(
    await getMaterialDownload(
      makeContext(store.db, s.student),
      quarantined.value.materialId,
      {},
      { storage },
    ),
  ).toEqual({ ok: false, code: "CONFLICT" });
  const clean = await upload();
  if (!clean.ok) throw Error(clean.code);
  expect(
    (
      await getMaterialDownload(
        makeContext(store.db, s.student),
        clean.value.materialId,
        {},
        { storage },
      )
    ).ok,
  ).toBe(true);
  expect(
    await getMaterialDownload(
      makeContext(store.db, s.otherTeacher),
      clean.value.materialId,
      {},
      { storage },
    ),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
  const listed = await listMaterials(makeContext(store.db, s.student), {
    offeringId: s.offeringId,
  });
  expect(JSON.stringify(listed)).not.toContain("quarantine/");
});
it("filters unsafe and revoked-session materials before student and guardian pagination while teachers retain quarantine metadata", async () => {
  const base = {
    academyId: s.academyId,
    offeringId: s.offeringId,
    uploaderId: s.teacher.userId,
    purpose: "material",
    mime: "application/pdf",
    bytes: 14,
    sha256: "f".repeat(64),
  };
  const rows = [
    ...Array.from({ length: 21 }, (_, index) => ({
      ...base,
      filename: `clean-${index}.pdf`,
      scanStatus: "clean",
      createdAt: new Date("2029-12-01T00:00:00Z"),
    })),
    ...Array.from({ length: 20 }, (_, index) => ({
      ...base,
      filename: `revoked-${index}.pdf`,
      scanStatus: "clean",
      sessionId: s.sessionId,
      createdAt: new Date("2029-12-01T00:00:01Z"),
    })),
    ...Array.from({ length: 20 }, (_, index) => ({
      ...base,
      filename: `quarantine-${index}.pdf`,
      scanStatus: "quarantined",
      createdAt: new Date("2029-12-01T00:00:02Z"),
    })),
  ].map((row) => ({
    ...row,
    objectKey: `quarantine/${s.academyId}/${randomUUID()}`,
  }));
  await store.db.material.createMany({ data: rows });
  await store.db.enrollmentSession.updateMany({
    where: { sessionId: s.sessionId },
    data: { status: "refund_pending" },
  });
  for (const [actor, studentId] of [
    [s.student, undefined],
    [s.parent, s.studentId],
  ] as const) {
    const first = await listMaterials(makeContext(store.db, actor), {
      offeringId: s.offeringId,
      studentId,
    });
    expect(first.ok && first.value.length).toBe(20);
    if (!first.ok) throw Error(first.code);
    expect(
      first.value.every(
        (row) =>
          row.filename.startsWith("clean-") && row.scanStatus === "clean",
      ),
    ).toBe(true);
    const second = await listMaterials(makeContext(store.db, actor), {
      offeringId: s.offeringId,
      studentId,
      cursor: first.value[19].id,
    });
    expect(second.ok && second.value.length).toBe(1);
    if (!second.ok) throw Error(second.code);
    expect(second.value[0].filename).toMatch(/^clean-/);
    expect(
      new Set([...first.value, ...second.value].map((row) => row.id)).size,
    ).toBe(21);
  }
  const teacher = await listMaterials(makeContext(store.db, s.teacher), {
    offeringId: s.offeringId,
  });
  expect(teacher.ok && teacher.value.length).toBe(20);
  expect(
    teacher.ok &&
      teacher.value.every((row) => row.scanStatus === "quarantined"),
  ).toBe(true);
});
it("blocks other students' files and keeps same-owner attachment history across resubmissions", async () => {
  const file = await upload("submission");
  if (!file.ok) throw Error(file.code);
  const assignment = await createAssignment(makeContext(store.db, s.teacher), {
    offeringId: s.offeringId,
    title: "x",
    instructions: "",
    dueAt: "2030-01-01T00:00:00Z",
  });
  if (!assignment.ok) throw Error(assignment.code);
  for (const text of ["v1", "v2"])
    expect(
      (
        await submitAssignment(makeContext(store.db, s.student), {
          assignmentId: assignment.value.assignmentId,
          text,
          fileIds: [file.value.materialId],
        })
      ).ok,
    ).toBe(true);
  expect(
    await deleteMaterial(makeContext(store.db, s.student), {
      materialId: file.value.materialId,
      reason: "remove",
    }),
  ).toEqual({ ok: false, code: "CONFLICT" });
  expect(
    await getMaterialDownload(
      makeContext(store.db, s.otherParent),
      file.value.materialId,
      { studentId: s.studentId, assignmentId: assignment.value.assignmentId },
      { storage },
    ),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
  const otherAccount = await store.db.user.create({
    data: { email: `second-${file.value.materialId}@example.test` },
  });
  await seedLearning(store.db, {
    ...s,
    studentId: s.otherStudentId,
    student: { userId: otherAccount.id },
    parent: s.otherParent,
  });
  expect(
    await submitAssignment(makeContext(store.db, { userId: otherAccount.id }), {
      assignmentId: assignment.value.assignmentId,
      text: "stolen file",
      fileIds: [file.value.materialId],
    }),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
it("requires the exact referenced assignment for submission downloads and isolates refunded session contexts", async () => {
  const second = await store.db.session.findFirstOrThrow({
    where: { offeringId: s.offeringId, id: { not: s.sessionId } },
  });
  const file = await upload("submission");
  if (!file.ok) throw Error(file.code);
  const assignmentIds = [];
  for (const sessionId of [s.sessionId, second.id]) {
    const a = await createAssignment(makeContext(store.db, s.teacher), {
      offeringId: s.offeringId,
      sessionId,
      title: "session exercise",
      instructions: "",
      dueAt: "2030-01-01T00:00:00Z",
    });
    if (!a.ok) throw Error(a.code);
    assignmentIds.push(a.value.assignmentId);
    expect(
      (
        await submitAssignment(makeContext(store.db, s.student), {
          assignmentId: a.value.assignmentId,
          text: "answer",
          fileIds: [file.value.materialId],
        })
      ).ok,
    ).toBe(true);
  }
  expect(
    await getMaterialDownload(
      makeContext(store.db, s.student),
      file.value.materialId,
      {},
      { storage },
    ),
  ).toEqual({ ok: false, code: "VALIDATION" });
  await store.db.enrollmentSession.updateMany({
    where: { sessionId: s.sessionId },
    data: { status: "refund_pending" },
  });
  expect(
    await getMaterialDownload(
      makeContext(store.db, s.student),
      file.value.materialId,
      { assignmentId: assignmentIds[0] },
      { storage },
    ),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
  expect(
    (
      await getMaterialDownload(
        makeContext(store.db, s.student),
        file.value.materialId,
        { assignmentId: assignmentIds[1] },
        { storage },
      )
    ).ok,
  ).toBe(true);
});
it("rechecks authorization after signing and records no successful download on revocation", async () => {
  const file = await upload();
  if (!file.ok) throw Error(file.code);
  const port = {
    downloadHosts: storage.downloadHosts,
    upload: storage.upload.bind(storage),
    delete: storage.delete.bind(storage),
    signDownload: async (input: { key: string; expiresIn: 60 }) => {
      const url = await storage.signDownload(input);
      await store.db.guardianLink.update({
        where: {
          guardianId_studentId: {
            guardianId: s.parent.userId,
            studentId: s.studentId,
          },
        },
        data: { revokedAt: new Date() },
      });
      return url;
    },
  };
  expect(
    await getMaterialDownload(
      makeContext(store.db, s.parent),
      file.value.materialId,
      { studentId: s.studentId },
      { storage: port },
    ),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
  expect(
    await store.db.auditEvent.count({
      where: { targetId: file.value.materialId, action: "material.download" },
    }),
  ).toBe(0);
});
it("keeps failed uploads quarantined, permits retry, and soft-deletes with a reason", async () => {
  const failure = {
    downloadHosts: storage.downloadHosts,
    upload: async () => {
      throw Error("provider unavailable");
    },
    delete: storage.delete.bind(storage),
    signDownload: storage.signDownload.bind(storage),
  };
  expect(
    await uploadMaterial(
      makeContext(store.db, s.teacher),
      {
        offeringId: s.offeringId,
        purpose: "material",
        filename: "lesson.pdf",
        mime: "application/pdf",
        data: pdf,
      },
      { storage: failure, scanner: storage },
    ),
  ).toEqual({ ok: false, code: "PROVIDER_UNAVAILABLE" });
  expect(
    await store.db.material.count({ where: { scanStatus: "quarantined" } }),
  ).toBe(1);
  const file = await upload();
  if (!file.ok) throw Error(file.code);
  expect(
    (
      await deleteMaterial(makeContext(store.db, s.teacher), {
        materialId: file.value.materialId,
        reason: "교체 자료",
      })
    ).ok,
  ).toBe(true);
  expect(
    await getMaterialDownload(
      makeContext(store.db, s.student),
      file.value.materialId,
      {},
      { storage },
    ),
  ).toEqual({ ok: false, code: "NOT_FOUND" });
  expect(
    await store.db.auditEvent.findFirst({
      where: { targetId: file.value.materialId, action: "material.deleted" },
      select: { reason: true },
    }),
  ).toEqual({ reason: "교체 자료" });
});
it("does not trust forged scan status and rejects infected or mismatched file signatures", async () => {
  const input = {
    offeringId: s.offeringId,
    purpose: "material" as const,
    filename: "lesson.pdf",
    mime: "application/pdf",
    data: pdf,
    scanStatus: "clean",
  };
  expect(
    await uploadMaterial(makeContext(store.db, s.teacher), input, {
      storage,
      scanner: storage,
    }),
  ).toEqual({ ok: false, code: "VALIDATION" });
  expect(
    await uploadMaterial(
      makeContext(store.db, s.teacher),
      { ...input, data: Buffer.from("not pdf") },
      { storage, scanner: storage },
    ),
  ).toEqual({ ok: false, code: "VALIDATION" });
  const infected = await uploadMaterial(
    makeContext(store.db, s.teacher),
    {
      offeringId: s.offeringId,
      purpose: "material",
      filename: "lesson.pdf",
      mime: "application/pdf",
      data: Buffer.from("%PDF-1.7 EICAR"),
    },
    { storage, scanner: storage },
  );
  if (!infected.ok) throw Error(infected.code);
  expect(infected.value.scanStatus).toBe("rejected");
  expect(
    await getMaterialDownload(
      makeContext(store.db, s.student),
      infected.value.materialId,
      {},
      { storage },
    ),
  ).toEqual({ ok: false, code: "CONFLICT" });
});
it("denies session-bound downloads and writes during refund pending", async () => {
  const file = await uploadMaterial(
    makeContext(store.db, s.teacher),
    {
      offeringId: s.offeringId,
      sessionId: s.sessionId,
      purpose: "material",
      filename: "lesson.pdf",
      mime: "application/pdf",
      data: pdf,
    },
    { storage, scanner: storage },
  );
  if (!file.ok) throw Error(file.code);
  await store.db.enrollmentSession.updateMany({
    where: { sessionId: s.sessionId },
    data: { status: "refund_pending" },
  });
  expect(
    await getMaterialDownload(
      makeContext(store.db, s.student),
      file.value.materialId,
      {},
      { storage },
    ),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
