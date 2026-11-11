import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { AppError, attempt, ensure, type Outcome } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import {
  createRecordingStreamToken,
  decryptZoomSecret,
  encryptZoomSecret,
  verifyRecordingStreamToken,
} from "@/integrations/zoom/crypto";
import { getZoomProvider } from "@/integrations/zoom/provider";
import { ensureValidZoomAccessToken } from "./account";

export type IncomingRecordingFile = {
  id: string;
  fileType: string;
  recordingType?: string;
  fileSize?: number;
  playUrl?: string;
  downloadUrl?: string;
  recordingStart?: string;
  recordingEnd?: string;
  status?: string;
};

export async function upsertZoomRecordingFiles(
  db: PrismaClient,
  meeting: {
    id: string;
    sessionId: string;
    zoomMeetingUuid: string | null;
    zoomMeetingId: string;
  },
  files: IncomingRecordingFile[],
  now = new Date(),
) {
  const saved = [];
  for (const file of files) {
    if (!file.id) continue;
    const start = file.recordingStart ? new Date(file.recordingStart) : null;
    const end = file.recordingEnd ? new Date(file.recordingEnd) : null;
    const durationSeconds =
      start &&
      end &&
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end > start
        ? Math.round((end.getTime() - start.getTime()) / 1000)
        : 3000;

    const existing = await db.zoomRecording.findUnique({
      where: { zoomRecordingFileId: file.id },
    });

    const row = await db.zoomRecording.upsert({
      where: { zoomRecordingFileId: file.id },
      create: {
        sessionId: meeting.sessionId,
        zoomMeetingRowId: meeting.id,
        zoomMeetingUuid: meeting.zoomMeetingUuid || meeting.zoomMeetingId,
        zoomRecordingFileId: file.id,
        fileType: (file.fileType || "MP4").toUpperCase(),
        recordingType:
          file.recordingType || "shared_screen_with_speaker_view",
        fileSize: Math.max(0, Number(file.fileSize || 0)),
        encryptedPlayUrl: file.playUrl ? encryptZoomSecret(file.playUrl) : null,
        encryptedDownloadUrl: file.downloadUrl
          ? encryptZoomSecret(file.downloadUrl)
          : null,
        recordingStart: start && !Number.isNaN(start.getTime()) ? start : now,
        recordingEnd: end && !Number.isNaN(end.getTime()) ? end : now,
        durationSeconds,
        isPublic: existing ? existing.isPublic : false,
        consentNoticeConfirmed: true,
        status:
          file.status === "completed" || !file.status
            ? "completed"
            : "processing",
      },
      update: {
        fileType: (file.fileType || "MP4").toUpperCase(),
        recordingType:
          file.recordingType || "shared_screen_with_speaker_view",
        fileSize: Math.max(0, Number(file.fileSize || 0)),
        ...(file.playUrl
          ? { encryptedPlayUrl: encryptZoomSecret(file.playUrl) }
          : {}),
        ...(file.downloadUrl
          ? { encryptedDownloadUrl: encryptZoomSecret(file.downloadUrl) }
          : {}),
        durationSeconds,
        status:
          file.status === "completed" || !file.status
            ? "completed"
            : "processing",
      },
    });
    saved.push(row);
  }
  return saved;
}

export function syncSessionZoomRecordings(
  ctx: ServiceContext,
  sessionId: string,
): Promise<
  Outcome<{
    syncedCount: number;
    recordings: Array<{
      id: string;
      zoomRecordingFileId: string;
      fileType: string;
      fileSize: number;
      durationSeconds: number;
      isPublic: boolean;
      status: string;
    }>;
  }>
> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    z.uuid().parse(sessionId);

    const session = await ctx.db.session.findUnique({
      where: { id: sessionId },
      include: {
        offering: { include: { instructors: true } },
        zoomMeeting: true,
      },
    });
    ensure(session && session.zoomMeeting, "NOT_FOUND");

    if (!actor.platformAdmin) {
      const membership = await ctx.db.academyMembership.findUnique({
        where: {
          academyId_userId: {
            academyId: session.academyId,
            userId: actor.id,
          },
        },
      });
      const allowed =
        Boolean(membership?.active) &&
        (membership?.role === "owner" ||
          session.offering.instructors.some((i) => i.userId === actor.id));
      ensure(allowed, "FORBIDDEN");
    }

    const meeting = session.zoomMeeting;
    const accessToken = await ensureValidZoomAccessToken(
      ctx.db,
      meeting.instructorId,
      ctx.now(),
    );
    const remoteFiles = await getZoomProvider().getMeetingRecordings(
      accessToken,
      meeting.zoomMeetingUuid || meeting.zoomMeetingId,
    );

    const saved = await upsertZoomRecordingFiles(
      ctx.db,
      meeting,
      remoteFiles,
      ctx.now(),
    );

    await ctx.db.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "zoom.recording.synced",
        targetId: session.id,
        reason: `count:${saved.length}`,
        createdAt: ctx.now(),
      },
    });

    return {
      syncedCount: saved.length,
      recordings: saved.map((r) => ({
        id: r.id,
        zoomRecordingFileId: r.zoomRecordingFileId,
        fileType: r.fileType,
        fileSize: r.fileSize,
        durationSeconds: r.durationSeconds,
        isPublic: r.isPublic,
        status: r.status,
      })),
    };
  });
}

export function setZoomRecordingVisibility(
  ctx: ServiceContext,
  input: {
    recordingId: string;
    isPublic: boolean;
    consentNoticeConfirmed?: boolean;
  },
): Promise<Outcome<{ id: string; isPublic: boolean; approvedAt: string | null }>> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    const data = z
      .object({
        recordingId: z.uuid(),
        isPublic: z.boolean(),
        consentNoticeConfirmed: z.boolean().default(true),
      })
      .strict()
      .parse(input);

    if (data.isPublic) {
      ensure(data.consentNoticeConfirmed, "VALIDATION");
    }

    const recording = await ctx.db.zoomRecording.findUnique({
      where: { id: data.recordingId },
      include: {
        session: {
          include: {
            offering: { include: { instructors: true } },
          },
        },
      },
    });
    ensure(recording && recording.status !== "deleted", "NOT_FOUND");

    if (!actor.platformAdmin) {
      const membership = await ctx.db.academyMembership.findUnique({
        where: {
          academyId_userId: {
            academyId: recording.session.academyId,
            userId: actor.id,
          },
        },
      });
      const allowed =
        Boolean(membership?.active) &&
        (membership?.role === "owner" ||
          recording.session.offering.instructors.some(
            (i) => i.userId === actor.id,
          ));
      ensure(allowed, "FORBIDDEN");
    }

    const updated = await ctx.db.$transaction(async (tx) => {
      const row = await tx.zoomRecording.update({
        where: { id: recording.id },
        data: {
          isPublic: data.isPublic,
          consentNoticeConfirmed: data.consentNoticeConfirmed,
          approvedById: data.isPublic ? actor.id : null,
          approvedAt: data.isPublic ? ctx.now() : null,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: data.isPublic
            ? "zoom.recording.published"
            : "zoom.recording.unpublished",
          targetId: recording.id,
          createdAt: ctx.now(),
        },
      });
      return row;
    });

    return {
      id: updated.id,
      isPublic: updated.isPublic,
      approvedAt: updated.approvedAt ? updated.approvedAt.toISOString() : null,
    };
  });
}

async function authorizeRecordingAccess(
  ctx: ServiceContext,
  recordingId: string,
) {
  const actor = await requireActor(ctx);
  const recording = await ctx.db.zoomRecording.findUnique({
    where: { id: recordingId },
    include: {
      session: {
        include: {
          offering: {
            include: {
              course: true,
              instructors: true,
            },
          },
        },
      },
    },
  });
  ensure(recording && recording.status === "completed", "NOT_FOUND");
  ensure(recording.session.offering.status !== "cancelled", "FORBIDDEN");

  const membership = await ctx.db.academyMembership.findUnique({
    where: {
      academyId_userId: {
        academyId: recording.session.academyId,
        userId: actor.id,
      },
    },
  });
  const isStaff =
    actor.platformAdmin ||
    (Boolean(membership?.active) &&
      (membership?.role === "owner" ||
        recording.session.offering.instructors.some(
          (i) => i.userId === actor.id,
        )));

  if (!isStaff) {
    // Non-staff (student / guardian) CANNOT access unpublished recordings!
    ensure(recording.isPublic, "FORBIDDEN");

    const student = await ctx.db.studentProfile.findUnique({
      where: { accountUserId: actor.id },
    });
    const guardianStudentIds = (
      await ctx.db.guardianLink.findMany({
        where: { guardianId: actor.id, revokedAt: null },
        select: { studentId: true },
      })
    ).map((g) => g.studentId);

    const candidateStudentIds = [
      ...(student ? [student.id] : []),
      ...guardianStudentIds,
    ];
    ensure(candidateStudentIds.length > 0, "FORBIDDEN");

    const enrollments = await ctx.db.enrollment.findMany({
      where: {
        offeringId: recording.session.offeringId,
        studentId: { in: candidateStudentIds },
        status: { in: ["active", "completed"] },
      },
    });
    ensure(enrollments.length > 0, "FORBIDDEN");

    const validUnexpired = enrollments.some(
      (e) => !e.expiresAt || e.expiresAt > ctx.now(),
    );
    if (!validUnexpired) {
      throw new AppError("EXPIRED");
    }
  }

  return { actor, recording, isStaff };
}

export function requestZoomRecordingPlayback(
  ctx: ServiceContext,
  recordingId: string,
): Promise<
  Outcome<{
    recordingId: string;
    courseTitle: string;
    fileType: string;
    durationSeconds: number;
    streamUrl: string;
    expiresAt: string;
    consentNotice: string;
  }>
> {
  return attempt(async () => {
    z.uuid().parse(recordingId);
    const { actor, recording } = await authorizeRecordingAccess(
      ctx,
      recordingId,
    );

    const expiresAt = new Date(ctx.now().getTime() + 5 * 60 * 1000); // 5-minute signed playback ticket
    const token = createRecordingStreamToken({
      recordingId: recording.id,
      actorUserId: actor.id,
      expiresAt,
    });

    await ctx.db.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "zoom.recording.playback_issued",
        targetId: recording.id,
        createdAt: ctx.now(),
      },
    });

    return {
      recordingId: recording.id,
      courseTitle: recording.session.offering.course.title,
      fileType: recording.fileType,
      durationSeconds: recording.durationSeconds,
      // Never expose raw Zoom URL or Zoom Access Token to the browser!
      streamUrl: `/api/zoom/recordings/${recording.id}/stream?token=${encodeURIComponent(token)}`,
      expiresAt: expiresAt.toISOString(),
      consentNotice:
        "본 녹화 영상은 수강생의 복습 목적으로만 제공되며 무단 복제·배포·공유가 금지됩니다.",
    };
  });
}

export function resolveZoomRecordingStream(
  ctx: ServiceContext,
  recordingId: string,
  token: string,
): Promise<
  Outcome<{
    recordingId: string;
    courseTitle: string;
    fileType: string;
    durationSeconds: number;
    verifiedSourceHost: string;
    playbackReady: boolean;
  }>
> {
  return attempt(async () => {
    z.uuid().parse(recordingId);
    const verified = verifyRecordingStreamToken(token, ctx.now());
    ensure(verified && verified.recordingId === recordingId, "FORBIDDEN");
    ensure(verified.actorUserId === ctx.actor.userId, "FORBIDDEN");

    const { recording } = await authorizeRecordingAccess(ctx, recordingId);
    const rawUrl = recording.encryptedPlayUrl
      ? decryptZoomSecret(recording.encryptedPlayUrl)
      : "";
    let verifiedSourceHost = "zoom.us";
    if (rawUrl) {
      try {
        verifiedSourceHost = new URL(rawUrl).hostname;
      } catch {
        verifiedSourceHost = "zoom.us";
      }
    }

    return {
      recordingId: recording.id,
      courseTitle: recording.session.offering.course.title,
      fileType: recording.fileType,
      durationSeconds: recording.durationSeconds,
      verifiedSourceHost,
      playbackReady: true,
    };
  });
}

