import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Material } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { AppError, attempt, ensure } from "@/server/errors";
import type { StoragePort, FileScanner } from "@/integrations/storage/port";
import {
  getStorageProvider,
  getFileScanner,
  validateFile,
  safeDownloadUrl,
} from "@/integrations/storage/provider";
import {
  requireLearningRead,
  requireStudentAccess,
  requireTeachingAccess,
} from "./access";
import {
  learningSessionFilter,
  learningTransactionContext,
  lockLearningWrite,
  validateLearningSession,
} from "./assignments";

const uploadInput = z
  .object({
    offeringId: z.uuid(),
    sessionId: z.uuid().optional(),
    purpose: z.enum(["material", "submission"]),
    filename: z.string().min(1).max(200),
    mime: z.string(),
    data: z.instanceof(Uint8Array),
  })
  .strict();
const publicMaterial = {
  id: true,
  filename: true,
  mime: true,
  bytes: true,
  scanStatus: true,
  purpose: true,
  sessionId: true,
  createdAt: true,
} as const;
async function uploadAccess(
  ctx: ServiceContext,
  data: { offeringId: string; sessionId?: string | null; purpose: string },
) {
  await validateLearningSession(ctx, data.offeringId, data.sessionId);
  return data.purpose === "material"
    ? requireTeachingAccess(ctx, data.offeringId)
    : requireStudentAccess(ctx, data.offeringId, {
        sessionId: data.sessionId ?? undefined,
        historical: true,
      });
}
async function downloadAccess(
  ctx: ServiceContext,
  file: Material,
  options: { studentId?: string; assignmentId?: string },
) {
  ensure(!file.deletedAt, "NOT_FOUND");
  const student =
    file.purpose === "submission"
      ? (file.ownerStudentId ?? undefined)
      : options.studentId;
  if (file.purpose === "submission" && options.studentId)
    ensure(options.studentId === file.ownerStudentId, "FORBIDDEN");
  if (file.purpose === "submission") ensure(options.assignmentId, "VALIDATION");
  const access = await requireLearningRead(ctx, file.offeringId, {
    studentId: student,
    sessionId: file.sessionId ?? undefined,
  });
  ensure(access.academyId === file.academyId, "FORBIDDEN");
  if (file.purpose === "submission") {
    ensure(!!file.ownerStudentId, "FORBIDDEN");
    // Authorize the exact assignment context. One cancelled assignment cannot
    // revoke an independently valid use of an offering-wide attachment.
    const reference = await ctx.db.submissionFile.findFirst({
      where: {
        materialId: file.id,
        studentId: file.ownerStudentId,
        offeringId: file.offeringId,
        academyId: file.academyId,
        submission: {
          assignmentId: options.assignmentId,
          studentId: file.ownerStudentId,
        },
      },
      select: {
        submission: {
          select: {
            assignment: {
              select: { sessionId: true, offeringId: true, academyId: true },
            },
          },
        },
      },
    });
    ensure(reference, "FORBIDDEN");
    const assignment = reference.submission.assignment;
    ensure(
      assignment.offeringId === file.offeringId &&
        assignment.academyId === file.academyId,
      "FORBIDDEN",
    );
    await requireLearningRead(ctx, file.offeringId, {
      studentId: student,
      sessionId: assignment.sessionId ?? undefined,
    });
  }
  ensure(file.scanStatus === "clean", "CONFLICT");
  return access;
}
export function uploadMaterial(
  ctx: ServiceContext,
  input: z.input<typeof uploadInput>,
  ports?: { storage: StoragePort; scanner: FileScanner },
) {
  return attempt(async () => {
    const data = uploadInput.parse(input);
    const checked = validateFile(data);
    const initial = await uploadAccess(ctx, data);
    const materialId = randomUUID();
    const key = `quarantine/${initial.academyId}/${materialId}`;
    const storage = ports?.storage ?? getStorageProvider();
    const scanner = ports?.scanner ?? getFileScanner();
    await ctx.db.$transaction(async (tx) => {
      await lockLearningWrite(ctx, tx, initial);
      const current = learningTransactionContext(ctx, tx);
      const access = await uploadAccess(current, data);
      await tx.material.create({
        data: {
          id: materialId,
          academyId: access.academyId,
          offeringId: data.offeringId,
          sessionId: data.sessionId,
          uploaderId: ctx.actor.userId,
          ownerStudentId: access.role === "student" ? access.studentId : null,
          purpose: data.purpose,
          filename: data.filename,
          mime: data.mime,
          ...checked,
          objectKey: key,
          scanStatus: "quarantined",
          createdAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "material.quarantined",
          targetId: materialId,
          createdAt: ctx.now(),
        },
      });
    });
    let scanStatus = "quarantined";
    try {
      await storage.upload({ key, data: data.data, mime: data.mime });
      const result = await scanner.scan({
        data: data.data,
        mime: data.mime,
        sha256: checked.sha256,
      });
      if (result === "clean" || result === "rejected") scanStatus = result;
    } catch {
      await ctx.db.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "material.upload_failed",
          targetId: materialId,
          createdAt: ctx.now(),
        },
      });
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
    // No provider call runs under a database lock. Re-check rights after I/O;
    // revoked uploads remain quarantined and can never receive signed URLs.
    await ctx.db.$transaction(async (tx) => {
      await lockLearningWrite(ctx, tx, initial);
      const current = learningTransactionContext(ctx, tx);
      await uploadAccess(current, data);
      const updated = await tx.material.updateMany({
        where: { id: materialId, deletedAt: null, scanStatus: "quarantined" },
        data: { scanStatus },
      });
      ensure(updated.count === 1, "CONFLICT");
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: `material.${scanStatus}`,
          targetId: materialId,
          createdAt: ctx.now(),
        },
      });
    });
    return { materialId, scanStatus };
  });
}
export const createMaterial = uploadMaterial;
export function getMaterialDownload(
  ctx: ServiceContext,
  id: string,
  input: { studentId?: string; assignmentId?: string } = {},
  ports?: { storage: StoragePort },
) {
  return attempt(async () => {
    z.uuid().parse(id);
    const options = z
      .object({
        studentId: z.uuid().optional(),
        assignmentId: z.uuid().optional(),
      })
      .strict()
      .parse(input);
    const file = await ctx.db.material.findUnique({ where: { id } });
    ensure(file, "NOT_FOUND");
    await downloadAccess(ctx, file, options);
    const storage = ports?.storage ?? getStorageProvider();
    let url: string;
    try {
      url = safeDownloadUrl(
        await storage.signDownload({ key: file.objectKey, expiresIn: 60 }),
        storage.downloadHosts,
      );
    } catch {
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
    await ctx.db.$transaction(async (tx) => {
      const current = learningTransactionContext(ctx, tx);
      const latest = await tx.material.findUniqueOrThrow({ where: { id } });
      await downloadAccess(current, latest, options);
      ensure(latest.objectKey === file.objectKey, "CONFLICT");
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "material.download",
          targetId: id,
          createdAt: ctx.now(),
        },
      });
    });
    return { url };
  });
}
export function deleteMaterial(
  ctx: ServiceContext,
  input: { materialId: string; reason: string },
) {
  return attempt(async () => {
    const data = z
      .object({
        materialId: z.uuid(),
        reason: z.string().trim().min(1).max(500),
      })
      .strict()
      .parse(input);
    const file = await ctx.db.material.findUnique({
      where: { id: data.materialId },
    });
    ensure(file && !file.deletedAt, "NOT_FOUND");
    const initial = await uploadAccess(ctx, file);
    if (file.purpose === "submission")
      ensure(
        initial.role === "student" &&
          initial.studentId === file.ownerStudentId &&
          file.uploaderId === ctx.actor.userId,
        "FORBIDDEN",
      );
    await ctx.db.$transaction(async (tx) => {
      await lockLearningWrite(ctx, tx, initial);
      const current = learningTransactionContext(ctx, tx);
      const latest = await tx.material.findUniqueOrThrow({
        where: { id: file.id },
      });
      await uploadAccess(current, latest);
      ensure(!latest.deletedAt, "NOT_FOUND");
      ensure(
        (await tx.submissionFile.count({ where: { materialId: file.id } })) ===
          0,
        "CONFLICT",
      );
      await tx.material.update({
        where: { id: file.id },
        data: { deletedAt: ctx.now() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "material.deleted",
          targetId: file.id,
          reason: data.reason,
          createdAt: ctx.now(),
        },
      });
    });
  });
}
export function listMaterials(
  ctx: ServiceContext,
  input: { offeringId: string; studentId?: string; cursor?: string },
) {
  return attempt(async () => {
    const data = z
      .object({
        offeringId: z.uuid(),
        studentId: z.uuid().optional(),
        cursor: z.uuid().optional(),
      })
      .strict()
      .parse(input);
    const access = await requireLearningRead(ctx, data.offeringId, {
      studentId: data.studentId,
    });
    const rows = await ctx.db.material.findMany({
      ...(data.cursor ? { cursor: { id: data.cursor }, skip: 1 } : {}),
      where: {
        offeringId: data.offeringId,
        purpose: "material",
        deletedAt: null,
        ...(access.role === "instructor" ? {} : { scanStatus: "clean" }),
        ...learningSessionFilter(access),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: publicMaterial,
    });
    return rows;
  });
}
