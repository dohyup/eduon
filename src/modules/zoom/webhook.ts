import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure, type Outcome } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import {
  createZoomUrlValidationResponse,
  maskSensitivePayload,
  verifyZoomWebhookSignature,
} from "@/integrations/zoom/crypto";
import {
  recalculateSessionAttendance,
  resolveParticipantToStudent,
} from "./attendance";
import {
  upsertZoomRecordingFiles,
  type IncomingRecordingFile,
} from "./recordings";

export type ZoomWebhookPayload = {
  event: string;
  event_ts?: number;
  event_id?: string;
  payload?: {
    plainToken?: string;
    account_id?: string;
    object?: {
      id?: string | number;
      uuid?: string;
      host_id?: string;
      topic?: string;
      start_time?: string;
      end_time?: string;
      duration?: number;
      participant?: {
        id?: string;
        user_id?: string;
        participant_user_id?: string;
        customer_key?: string;
        registrant_id?: string;
        user_name?: string;
        email?: string;
        join_time?: string;
        leave_time?: string;
      };
      recording_files?: Array<{
        id?: string;
        file_type?: string;
        recording_type?: string;
        file_size?: number;
        play_url?: string;
        download_url?: string;
        recording_start?: string;
        recording_end?: string;
        status?: string;
      }>;
    };
  };
};

export function deriveWebhookEventId(
  body: ZoomWebhookPayload,
  trackingHeader?: string | null,
): string {
  if (body.event_id && typeof body.event_id === "string") {
    return body.event_id.slice(0, 128);
  }
  if (trackingHeader && trackingHeader.trim()) {
    return trackingHeader.trim().slice(0, 128);
  }
  const obj = body.payload?.object;
  const part = obj?.participant;
  const rawKey = [
    body.event,
    String(body.event_ts || 0),
    String(obj?.uuid || obj?.id || ""),
    String(
      part?.participant_user_id ||
        part?.id ||
        part?.user_id ||
        part?.customer_key ||
        "",
    ),
    String(part?.join_time || part?.leave_time || obj?.start_time || obj?.end_time || ""),
  ].join("|");
  return "evt_" + createHash("sha256").update(rawKey, "utf8").digest("hex").slice(0, 40);
}

async function executeWebhookPayload(
  db: PrismaClient,
  eventId: string,
  body: ZoomWebhookPayload,
  now: Date,
): Promise<{ status: "processed" | "ignored"; detail: string }> {
  const eventType = body.event;
  const obj = body.payload?.object;
  if (!obj) return { status: "ignored", detail: "no_object_in_payload" };

  const meetingIdStr = obj.id !== undefined ? String(obj.id) : "";
  const meetingUuidStr = obj.uuid ? String(obj.uuid) : "";

  const meeting = await db.zoomMeeting.findFirst({
    where: {
      OR: [
        ...(meetingUuidStr ? [{ zoomMeetingUuid: meetingUuidStr }] : []),
        ...(meetingIdStr ? [{ zoomMeetingId: meetingIdStr }] : []),
      ],
    },
    include: {
      session: true,
    },
  });

  if (!meeting) {
    return { status: "ignored", detail: "unmatched_meeting" };
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom_webhook_meeting:${meeting.id}`}))`;

    if (eventType === "meeting.started") {
      const startTime = obj.start_time ? new Date(obj.start_time) : now;
      await tx.zoomMeeting.update({
        where: { id: meeting.id },
        data: {
          status: "started",
          zoomMeetingUuid: meetingUuidStr || meeting.zoomMeetingUuid,
          startedAt:
            !Number.isNaN(startTime.getTime()) ? startTime : meeting.startedAt ?? now,
          lastSyncedAt: now,
        },
      });
      return { status: "processed", detail: "meeting.started" };
    }

    if (eventType === "meeting.participant_joined") {
      const p = obj.participant;
      if (!p) return { status: "ignored", detail: "missing_participant" };

      const participantKey = String(
        p.customer_key ||
          p.participant_user_id ||
          p.id ||
          p.user_id ||
          p.email ||
          p.user_name ||
          "unknown",
      );
      const joinTime = p.join_time ? new Date(p.join_time) : now;
      const validJoinTime = Number.isNaN(joinTime.getTime()) ? now : joinTime;

      const resolved = await resolveParticipantToStudent(
        tx as unknown as PrismaClient,
        meeting.offeringId,
        {
          participantId: participantKey,
          customerKey: p.customer_key || p.registrant_id || null,
          email: p.email || null,
          userName: p.user_name || null,
        },
      );

      // Check if an out-of-order participant_left arrived earlier for this participant
      const outOfOrderLeave = await tx.zoomAttendanceSession.findFirst({
        where: {
          zoomMeetingRowId: meeting.id,
          participantId: participantKey,
          joinEventId: null,
          leaveEventId: { not: null },
          leaveTime: { gte: validJoinTime },
        },
        orderBy: { leaveTime: "asc" },
      });

      if (outOfOrderLeave && outOfOrderLeave.leaveTime) {
        const durationSeconds = Math.max(
          0,
          Math.round(
            (outOfOrderLeave.leaveTime.getTime() - validJoinTime.getTime()) /
              1000,
          ),
        );
        await tx.zoomAttendanceSession.update({
          where: { id: outOfOrderLeave.id },
          data: {
            studentId: resolved.studentId ?? outOfOrderLeave.studentId,
            mappingStatus:
              resolved.mappingStatus !== "unmapped"
                ? resolved.mappingStatus
                : outOfOrderLeave.mappingStatus,
            joinTime: validJoinTime,
            durationSeconds,
            joinEventId: eventId,
            participantEmail: p.email ?? outOfOrderLeave.participantEmail,
            participantName: p.user_name ?? outOfOrderLeave.participantName,
          },
        });
      } else {
        // Check duplicate join at same timestamp for same participant
        const duplicateJoin = await tx.zoomAttendanceSession.findFirst({
          where: {
            zoomMeetingRowId: meeting.id,
            participantId: participantKey,
            joinTime: validJoinTime,
          },
        });
        if (!duplicateJoin) {
          await tx.zoomAttendanceSession.create({
            data: {
              sessionId: meeting.sessionId,
              studentId: resolved.studentId,
              zoomMeetingRowId: meeting.id,
              zoomMeetingUuid:
                meetingUuidStr ||
                meeting.zoomMeetingUuid ||
                meeting.zoomMeetingId,
              participantId: participantKey,
              participantEmail: p.email ?? null,
              participantName: p.user_name ?? null,
              mappingStatus: resolved.mappingStatus,
              joinTime: validJoinTime,
              leaveTime: null,
              durationSeconds: 0,
              joinEventId: eventId,
            },
          });
        }
      }

      if (resolved.mappingStatus === "mapped") {
        await recalculateSessionAttendance(
          tx as unknown as PrismaClient,
          meeting.sessionId,
          { markAbsentForNonAttendees: false, now },
        );
      }
      return {
        status: "processed",
        detail: `participant_joined:${resolved.mappingStatus}`,
      };
    }

    if (eventType === "meeting.participant_left") {
      const p = obj.participant;
      if (!p) return { status: "ignored", detail: "missing_participant" };

      const participantKey = String(
        p.customer_key ||
          p.participant_user_id ||
          p.id ||
          p.user_id ||
          p.email ||
          p.user_name ||
          "unknown",
      );
      const leaveTime = p.leave_time ? new Date(p.leave_time) : now;
      const validLeaveTime = Number.isNaN(leaveTime.getTime())
        ? now
        : leaveTime;

      const resolved = await resolveParticipantToStudent(
        tx as unknown as PrismaClient,
        meeting.offeringId,
        {
          participantId: participantKey,
          customerKey: p.customer_key || p.registrant_id || null,
          email: p.email || null,
          userName: p.user_name || null,
        },
      );

      // Find open attendance session for this participant
      const openSession = await tx.zoomAttendanceSession.findFirst({
        where: {
          zoomMeetingRowId: meeting.id,
          participantId: participantKey,
          leaveTime: null,
          joinTime: { lte: validLeaveTime },
        },
        orderBy: { joinTime: "desc" },
      });

      if (openSession) {
        const durationSeconds = Math.max(
          0,
          Math.round(
            (validLeaveTime.getTime() - openSession.joinTime.getTime()) / 1000,
          ),
        );
        await tx.zoomAttendanceSession.update({
          where: { id: openSession.id },
          data: {
            studentId: openSession.studentId ?? resolved.studentId,
            mappingStatus:
              openSession.mappingStatus === "mapped"
                ? "mapped"
                : resolved.mappingStatus,
            leaveTime: validLeaveTime,
            durationSeconds,
            leaveEventId: eventId,
          },
        });
      } else {
        // Out-of-order: participant_left arrived BEFORE participant_joined!
        const duplicateLeave = await tx.zoomAttendanceSession.findFirst({
          where: {
            zoomMeetingRowId: meeting.id,
            participantId: participantKey,
            leaveTime: validLeaveTime,
          },
        });
        if (!duplicateLeave) {
          await tx.zoomAttendanceSession.create({
            data: {
              sessionId: meeting.sessionId,
              studentId: resolved.studentId,
              zoomMeetingRowId: meeting.id,
              zoomMeetingUuid:
                meetingUuidStr ||
                meeting.zoomMeetingUuid ||
                meeting.zoomMeetingId,
              participantId: participantKey,
              participantEmail: p.email ?? null,
              participantName: p.user_name ?? null,
              mappingStatus: resolved.mappingStatus,
              joinTime: validLeaveTime,
              leaveTime: validLeaveTime,
              durationSeconds: 0,
              joinEventId: null,
              leaveEventId: eventId,
            },
          });
        }
      }

      await recalculateSessionAttendance(
        tx as unknown as PrismaClient,
        meeting.sessionId,
        { markAbsentForNonAttendees: false, now },
      );
      return {
        status: "processed",
        detail: `participant_left:${resolved.mappingStatus}`,
      };
    }

    if (eventType === "meeting.ended") {
      const endTime = obj.end_time ? new Date(obj.end_time) : now;
      const validEndTime = Number.isNaN(endTime.getTime())
        ? meeting.session.endsAt
        : endTime;

      await tx.zoomMeeting.update({
        where: { id: meeting.id },
        data: {
          status: "ended",
          endedAt: validEndTime,
          lastSyncedAt: now,
        },
      });

      // Close any unfinished attendance sessions at meeting end time
      const openSessions = await tx.zoomAttendanceSession.findMany({
        where: {
          zoomMeetingRowId: meeting.id,
          leaveTime: null,
        },
      });

      for (const open of openSessions) {
        const effectiveEnd =
          validEndTime > open.joinTime
            ? validEndTime
            : new Date(
                Math.max(
                  open.joinTime.getTime(),
                  meeting.session.endsAt.getTime(),
                ),
              );
        const durationSeconds = Math.max(
          0,
          Math.round(
            (effectiveEnd.getTime() - open.joinTime.getTime()) / 1000,
          ),
        );
        await tx.zoomAttendanceSession.update({
          where: { id: open.id },
          data: {
            leaveTime: effectiveEnd,
            durationSeconds,
            isCorrectedOnEnd: true,
          },
        });
      }

      await recalculateSessionAttendance(
        tx as unknown as PrismaClient,
        meeting.sessionId,
        { markAbsentForNonAttendees: true, now },
      );

      return {
        status: "processed",
        detail: `meeting.ended:corrected_${openSessions.length}`,
      };
    }

    if (eventType === "recording.completed") {
      const rawFiles = obj.recording_files || [];
      const incoming: IncomingRecordingFile[] = rawFiles
        .filter((f) => Boolean(f.id))
        .map((f) => ({
          id: String(f.id),
          fileType: String(f.file_type || "MP4"),
          recordingType: String(
            f.recording_type || "shared_screen_with_speaker_view",
          ),
          fileSize: Number(f.file_size || 0),
          playUrl: String(f.play_url || ""),
          downloadUrl: String(f.download_url || ""),
          recordingStart: f.recording_start,
          recordingEnd: f.recording_end,
          status: f.status || "completed",
        }));

      const saved = await upsertZoomRecordingFiles(
        tx as unknown as PrismaClient,
        meeting,
        incoming,
        now,
      );
      return {
        status: "processed",
        detail: `recording.completed:${saved.length}`,
      };
    }

    return { status: "ignored", detail: `unsupported_event:${eventType}` };
  });
}

export async function processZoomWebhookRequest(input: {
  db: PrismaClient;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  trackingHeader?: string | null;
  now?: Date;
}): Promise<
  | {
      kind: "url_validation";
      status: 200;
      body: { plainToken: string; encryptedToken: string };
    }
  | {
      kind: "event";
      status: 200 | 401 | 422 | 500;
      body: {
        ok: boolean;
        eventId?: string;
        duplicate?: boolean;
        detail?: string;
        code?: string;
      };
    }
> {
  const now = input.now ?? new Date();

  let parsed: ZoomWebhookPayload;
  try {
    parsed = JSON.parse(input.rawBody) as ZoomWebhookPayload;
  } catch {
    return {
      kind: "event",
      status: 422,
      body: { ok: false, code: "VALIDATION" },
    };
  }

  if (!parsed || typeof parsed.event !== "string") {
    return {
      kind: "event",
      status: 422,
      body: { ok: false, code: "VALIDATION" },
    };
  }

  // Verify HMAC-SHA256 signature and timestamp on ALL webhook requests
  const signatureValid = verifyZoomWebhookSignature({
    rawBody: input.rawBody,
    timestamp: input.timestampHeader,
    signature: input.signatureHeader,
    now,
  });
  if (!signatureValid) {
    return {
      kind: "event",
      status: 401,
      body: { ok: false, code: "UNAUTHENTICATED" },
    };
  }

  // Handle Zoom Webhook URL Validation challenge
  if (parsed.event === "endpoint.url_validation") {
    const plainToken = parsed.payload?.plainToken;
    if (!plainToken || typeof plainToken !== "string") {
      return {
        kind: "event",
        status: 422,
        body: { ok: false, code: "VALIDATION" },
      };
    }
    return {
      kind: "url_validation",
      status: 200,
      body: createZoomUrlValidationResponse(plainToken),
    };
  }

  const eventId = deriveWebhookEventId(parsed, input.trackingHeader);
  const maskedPayload = maskSensitivePayload(parsed);
  const eventTs = BigInt(parsed.event_ts ?? now.getTime());

  // Check idempotency / existing webhook event record
  const existing = await input.db.zoomWebhookEvent.findUnique({
    where: { eventId },
  });
  if (existing && existing.status === "processed") {
    return {
      kind: "event",
      status: 200,
      body: {
        ok: true,
        eventId,
        duplicate: true,
        detail: "already_processed",
      },
    };
  }

  const eventRow = await input.db.zoomWebhookEvent.upsert({
    where: { eventId },
    create: {
      eventId,
      eventType: parsed.event,
      eventTs,
      payload: maskedPayload,
      status: "processing",
      attempts: 1,
      receivedAt: now,
    },
    update: {
      status: "processing",
      attempts: { increment: 1 },
      errorMessage: null,
    },
  });

  try {
    const result = await executeWebhookPayload(
      input.db,
      eventId,
      parsed,
      now,
    );
    await input.db.zoomWebhookEvent.update({
      where: { id: eventRow.id },
      data: {
        status: result.status,
        processedAt: now,
        errorMessage: null,
      },
    });
    return {
      kind: "event",
      status: 200,
      body: {
        ok: true,
        eventId,
        duplicate: false,
        detail: result.detail,
      },
    };
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message.slice(0, 500) : "PROCESSING_ERROR";
    await input.db.zoomWebhookEvent.update({
      where: { id: eventRow.id },
      data: {
        status: "failed",
        errorMessage: errMsg,
      },
    });
    return {
      kind: "event",
      status: 500,
      body: {
        ok: false,
        eventId,
        code: "UNAVAILABLE",
      },
    };
  }
}

export function retryFailedZoomWebhookEvents(
  ctx: ServiceContext,
  input: { eventId?: string } = {},
): Promise<
  Outcome<{
    retriedCount: number;
    succeededCount: number;
    failedCount: number;
  }>
> {
  return attempt(async () => {
    const admin = await requireActor(ctx);
    ensure(admin.platformAdmin, "FORBIDDEN");

    const failedEvents = await ctx.db.zoomWebhookEvent.findMany({
      where: {
        ...(input.eventId ? { eventId: input.eventId } : {}),
        status: { in: ["failed", "pending"] },
      },
      orderBy: { receivedAt: "asc" },
      take: 50,
    });

    let succeededCount = 0;
    let failedCount = 0;

    for (const evt of failedEvents) {
      try {
        const parsed = JSON.parse(evt.payload) as ZoomWebhookPayload;
        const result = await executeWebhookPayload(
          ctx.db,
          evt.eventId,
          parsed,
          ctx.now(),
        );
        await ctx.db.zoomWebhookEvent.update({
          where: { id: evt.id },
          data: {
            status: result.status,
            attempts: { increment: 1 },
            errorMessage: null,
            processedAt: ctx.now(),
          },
        });
        succeededCount++;
      } catch (error) {
        failedCount++;
        await ctx.db.zoomWebhookEvent.update({
          where: { id: evt.id },
          data: {
            status: "failed",
            attempts: { increment: 1 },
            errorMessage:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "RETRY_FAILED",
          },
        });
      }
    }

    await ctx.db.auditEvent.create({
      data: {
        actorId: admin.id,
        action: "zoom.webhook.retried",
        targetId: input.eventId || "batch",
        reason: `retried:${failedEvents.length},succeeded:${succeededCount}`,
        createdAt: ctx.now(),
      },
    });

    return {
      retriedCount: failedEvents.length,
      succeededCount,
      failedCount,
    };
  });
}

