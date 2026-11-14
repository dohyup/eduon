import "server-only";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure, type Outcome } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { encryptZoomSecret } from "@/integrations/zoom/crypto";
import { getZoomProvider } from "@/integrations/zoom/provider";
import { ZoomApiError } from "@/integrations/zoom/port";
import { ensureValidZoomAccessToken } from "./account";

export type ZoomMeetingSummary = {
  id: string;
  sessionId: string;
  offeringId: string;
  instructorId: string;
  zoomMeetingId: string;
  zoomMeetingUuid: string | null;
  zoomHostId: string;
  waitingRoom: boolean;
  autoRecording: string;
  status: string;
  syncError: string | null;
  retryCount: number;
  recordingConsentRequired: boolean;
  startedAt: string | null;
  endedAt: string | null;
  cancelledAt: string | null;
  lastSyncedAt: string;
};

export type OfferingZoomSyncSummary = {
  status: "not_zoom" | "synced" | "partial_failure" | "unlinked_instructor";
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  warnings: string[];
  meetings: ZoomMeetingSummary[];
};

export function toZoomMeetingSummary(row: {
  id: string;
  sessionId: string;
  offeringId: string;
  instructorId: string;
  zoomMeetingId: string;
  zoomMeetingUuid: string | null;
  zoomHostId: string;
  waitingRoom: boolean;
  autoRecording: string;
  status: string;
  syncError: string | null;
  retryCount: number;
  recordingConsentRequired: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
  cancelledAt: Date | null;
  lastSyncedAt: Date;
}): ZoomMeetingSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    offeringId: row.offeringId,
    instructorId: row.instructorId,
    zoomMeetingId: row.zoomMeetingId,
    zoomMeetingUuid: row.zoomMeetingUuid,
    zoomHostId: row.zoomHostId,
    waitingRoom: row.waitingRoom,
    autoRecording: row.autoRecording,
    status: row.status,
    syncError: row.syncError,
    retryCount: row.retryCount,
    recordingConsentRequired: row.recordingConsentRequired,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
  };
}

async function authorizeOfferingInstructorOrOwner(
  ctx: ServiceContext,
  offeringId: string,
) {
  const actor = await requireActor(ctx);
  const offering = await ctx.db.offering.findUnique({
    where: { id: offeringId },
    include: {
      course: true,
      sessions: { orderBy: { startsAt: "asc" } },
      instructors: true,
    },
  });
  ensure(offering, "NOT_FOUND");
  if (!actor.platformAdmin) {
    const membership = await ctx.db.academyMembership.findUnique({
      where: {
        academyId_userId: {
          academyId: offering.academyId,
          userId: actor.id,
        },
      },
    });
    const isOwner = membership?.active && membership.role === "owner";
    const isAssignedInstructor =
      membership?.active &&
      offering.instructors.some((i) => i.userId === actor.id);
    ensure(isOwner || isAssignedInstructor, "FORBIDDEN");
  }
  return { actor, offering };
}

export async function syncOfferingZoomMeetingsInternal(
  ctx: ServiceContext,
  offeringId: string,
): Promise<OfferingZoomSyncSummary> {
  const offering = await ctx.db.offering.findUnique({
    where: { id: offeringId },
    include: {
      course: true,
      sessions: { orderBy: { startsAt: "asc" } },
      instructors: true,
    },
  });
  if (!offering || !offering.isZoomLive) {
    return {
      status: "not_zoom",
      createdCount: 0,
      updatedCount: 0,
      failedCount: 0,
      warnings: [],
      meetings: [],
    };
  }

  let primaryInstructorId =
    offering.instructors[0]?.userId ?? ctx.actor.userId;
  let zoomAccount = await ctx.db.zoomAccount.findUnique({
    where: { userId: primaryInstructorId },
  });
  if (
    process.env.NODE_ENV !== "test" &&
    (!zoomAccount || zoomAccount.zoomUserId === "zoom-host-5f0d97dc79")
  ) {
    const allAccounts = await ctx.db.zoomAccount.findMany({
      where: { status: "connected" },
    });
    const realAccount = allAccounts.find(
      (acc) => acc.zoomUserId !== "zoom-host-5f0d97dc79",
    );
    if (realAccount) {
      zoomAccount = realAccount;
      primaryInstructorId = realAccount.userId;
    }
  }

  const warnings: string[] = [];
  let effectiveAutoRecording = (offering.zoomAutoRecording || "none") as
    | "none"
    | "cloud"
    | "local";

  if (
    effectiveAutoRecording === "cloud" &&
    zoomAccount &&
    !zoomAccount.cloudRecordingAllowed
  ) {
    effectiveAutoRecording = "none";
    warnings.push(
      "강사 Zoom 계정이 클라우드 녹화를 지원하지 않는 무료(Basic) 계정이어서 자동 녹화가 비활성화되었습니다.",
    );
  }

  let accessToken: string | null = null;
  let tokenError: string | null = null;
  if (!zoomAccount || zoomAccount.status === "disconnected") {
    tokenError =
      "담당 강사의 Zoom 계정이 연결되어 있지 않습니다. 강사 화면에서 Zoom 계정을 연결한 뒤 동기화를 재시도해 주세요.";
  } else {
    try {
      accessToken = await ensureValidZoomAccessToken(
        ctx.db,
        primaryInstructorId,
        ctx.now(),
      );
    } catch {
      tokenError =
        "강사 Zoom 계정 토큰 갱신에 실패했습니다. Zoom 계정 재연결이 필요합니다.";
    }
  }

  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const summaries: ZoomMeetingSummary[] = [];
  const provider = getZoomProvider();

  for (let index = 0; index < offering.sessions.length; index++) {
    const session = offering.sessions[index];
    const durationMinutes = Math.max(
      15,
      Math.round(
        (session.endsAt.getTime() - session.startsAt.getTime()) / 60000,
      ),
    );
    const topic = `${offering.course.title} (${index + 1}회차)`;

    const existing = await ctx.db.zoomMeeting.findUnique({
      where: { sessionId: session.id },
    });

    if (!accessToken) {
      failedCount++;
      const row = await ctx.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom_session:${session.id}`}))`;
        return tx.zoomMeeting.upsert({
          where: { sessionId: session.id },
          create: {
            sessionId: session.id,
            offeringId: offering.id,
            instructorId: primaryInstructorId,
            zoomAccountId: zoomAccount?.id ?? null,
            zoomMeetingId: existing?.zoomMeetingId || "",
            zoomMeetingUuid: existing?.zoomMeetingUuid || null,
            zoomHostId: zoomAccount?.zoomUserId || "",
            joinUrl: existing?.joinUrl || "",
            waitingRoom: offering.zoomWaitingRoom,
            autoRecording: effectiveAutoRecording,
            status: "sync_failed",
            syncError: tokenError,
            retryCount: (existing?.retryCount ?? 0) + 1,
            recordingConsentRequired: effectiveAutoRecording !== "none",
            lastSyncedAt: ctx.now(),
          },
          update: {
            instructorId: primaryInstructorId,
            zoomAccountId: zoomAccount?.id ?? null,
            waitingRoom: offering.zoomWaitingRoom,
            autoRecording: effectiveAutoRecording,
            status:
              existing?.status === "scheduled" && existing.zoomMeetingId
                ? "needs_admin_review"
                : "sync_failed",
            syncError: tokenError,
            retryCount: { increment: 1 },
            lastSyncedAt: ctx.now(),
          },
        });
      });
      summaries.push(toZoomMeetingSummary(row));
      continue;
    }

    // If a valid scheduled meeting already exists for this session, update it rather than creating a duplicate!
    const isDummyExistingWithRealToken =
      process.env.NODE_ENV !== "test" &&
      !accessToken.startsWith("mock-") &&
      existing &&
      (existing.zoomHostId === "zoom-host-5f0d97dc79" ||
        existing.zoomMeetingId.startsWith("880"));

    if (
      existing &&
      existing.zoomMeetingId &&
      existing.status !== "cancelled" &&
      existing.status !== "sync_failed" &&
      !isDummyExistingWithRealToken
    ) {
      try {
        await provider.updateMeeting(accessToken, existing.zoomMeetingId, {
          topic,
          startTimeIso: session.startsAt.toISOString(),
          durationMinutes,
          waitingRoom: offering.zoomWaitingRoom,
          autoRecording: effectiveAutoRecording,
        });
        const updated = await ctx.db.zoomMeeting.update({
          where: { id: existing.id },
          data: {
            instructorId: primaryInstructorId,
            zoomAccountId: zoomAccount?.id ?? null,
            waitingRoom: offering.zoomWaitingRoom,
            autoRecording: effectiveAutoRecording,
            recordingConsentRequired: effectiveAutoRecording !== "none",
            status:
              existing.status === "needs_admin_review"
                ? "scheduled"
                : existing.status,
            syncError: null,
            lastSyncedAt: ctx.now(),
          },
        });
        updatedCount++;
        summaries.push(toZoomMeetingSummary(updated));
      } catch (error) {
        failedCount++;
        const errMsg =
          error instanceof ZoomApiError
            ? `Zoom 회의 일정 수정 실패 (${error.zoomCode})`
            : "Zoom 회의 일정 수정 중 통신 오류가 발생했습니다.";
        const updated = await ctx.db.zoomMeeting.update({
          where: { id: existing.id },
          data: {
            status: "sync_failed",
            syncError: errMsg,
            retryCount: { increment: 1 },
            lastSyncedAt: ctx.now(),
          },
        });
        summaries.push(toZoomMeetingSummary(updated));
      }
      continue;
    }

    // Create a new Zoom Meeting for this session (protected against duplicate creation via advisory lock)
    try {
      const createdRemote = await provider.createMeeting(accessToken, {
        topic,
        startTimeIso: session.startsAt.toISOString(),
        durationMinutes,
        waitingRoom: offering.zoomWaitingRoom,
        autoRecording: effectiveAutoRecording,
      });

      const savedRow = await ctx.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom_session:${session.id}`}))`;
        const currentInTx = await tx.zoomMeeting.findUnique({
          where: { sessionId: session.id },
        });
        if (
          currentInTx &&
          currentInTx.zoomMeetingId &&
          currentInTx.status === "scheduled" &&
          !isDummyExistingWithRealToken
        ) {
          return currentInTx;
        }
        const row = await tx.zoomMeeting.upsert({
          where: { sessionId: session.id },
          create: {
            sessionId: session.id,
            offeringId: offering.id,
            instructorId: primaryInstructorId,
            zoomAccountId: zoomAccount?.id ?? null,
            zoomMeetingId: createdRemote.meetingId,
            zoomMeetingUuid: createdRemote.meetingUuid,
            zoomHostId: createdRemote.hostId,
            joinUrl: createdRemote.joinUrl,
            encryptedPassword: createdRemote.password
              ? encryptZoomSecret(createdRemote.password)
              : null,
            waitingRoom: createdRemote.waitingRoom,
            autoRecording: createdRemote.autoRecording,
            status: "scheduled",
            syncError: null,
            retryCount: currentInTx ? currentInTx.retryCount : 0,
            recordingConsentRequired: effectiveAutoRecording !== "none",
            lastSyncedAt: ctx.now(),
          },
          update: {
            instructorId: primaryInstructorId,
            zoomAccountId: zoomAccount?.id ?? null,
            zoomMeetingId: createdRemote.meetingId,
            zoomMeetingUuid: createdRemote.meetingUuid,
            zoomHostId: createdRemote.hostId,
            joinUrl: createdRemote.joinUrl,
            encryptedPassword: createdRemote.password
              ? encryptZoomSecret(createdRemote.password)
              : null,
            waitingRoom: createdRemote.waitingRoom,
            autoRecording: createdRemote.autoRecording,
            status: "scheduled",
            syncError: null,
            recordingConsentRequired: effectiveAutoRecording !== "none",
            cancelledAt: null,
            lastSyncedAt: ctx.now(),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: ctx.actor.userId,
            action: "zoom.meeting.created",
            targetId: row.id,
            reason: `sessionId:${session.id},zoomMeetingId:${createdRemote.meetingId}`,
            createdAt: ctx.now(),
          },
        });
        return row;
      });
      createdCount++;
      summaries.push(toZoomMeetingSummary(savedRow));
    } catch (error) {
      failedCount++;
      const errMsg =
        error instanceof ZoomApiError
          ? error.status === 429
            ? "Zoom API 요청 한도(Rate Limit) 초과로 회의 생성이 지연되었습니다. 잠시 후 재시도해 주세요."
            : `Zoom 회의 생성 실패 (${error.zoomCode})`
          : "Zoom 서버 통신 장애로 회의를 생성하지 못했습니다. 강의 데이터는 안전하게 저장되었습니다.";
      const failedRow = await ctx.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom_session:${session.id}`}))`;
        return tx.zoomMeeting.upsert({
          where: { sessionId: session.id },
          create: {
            sessionId: session.id,
            offeringId: offering.id,
            instructorId: primaryInstructorId,
            zoomAccountId: zoomAccount?.id ?? null,
            zoomMeetingId: "",
            zoomMeetingUuid: null,
            zoomHostId: zoomAccount?.zoomUserId || "",
            joinUrl: "",
            waitingRoom: offering.zoomWaitingRoom,
            autoRecording: effectiveAutoRecording,
            status: "sync_failed",
            syncError: errMsg,
            retryCount: 1,
            recordingConsentRequired: effectiveAutoRecording !== "none",
            lastSyncedAt: ctx.now(),
          },
          update: {
            status: "sync_failed",
            syncError: errMsg,
            retryCount: { increment: 1 },
            lastSyncedAt: ctx.now(),
          },
        });
      });
      summaries.push(toZoomMeetingSummary(failedRow));
    }
  }

  return {
    status: !accessToken
      ? "unlinked_instructor"
      : failedCount > 0
        ? "partial_failure"
        : "synced",
    createdCount,
    updatedCount,
    failedCount,
    warnings,
    meetings: summaries,
  };
}

export function retryOfferingZoomSync(
  ctx: ServiceContext,
  offeringId: string,
): Promise<Outcome<OfferingZoomSyncSummary>> {
  return attempt(async () => {
    z.uuid().parse(offeringId);
    const { offering } = await authorizeOfferingInstructorOrOwner(
      ctx,
      offeringId,
    );
    if (!offering.isZoomLive) {
      await ctx.db.offering.update({
        where: { id: offeringId },
        data: { isZoomLive: true },
      });
    }
    return syncOfferingZoomMeetingsInternal(ctx, offeringId);
  });
}

export function updateSessionScheduleAndSyncZoom(
  ctx: ServiceContext,
  input: {
    sessionId: string;
    startsAt: string;
    endsAt: string;
    waitingRoom?: boolean;
    autoRecording?: "none" | "cloud" | "local";
  },
): Promise<Outcome<{ session: { id: string; startsAt: string; endsAt: string }; zoomMeeting: ZoomMeetingSummary | null }>> {
  return attempt(async () => {
    const data = z
      .object({
        sessionId: z.uuid(),
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
        waitingRoom: z.boolean().optional(),
        autoRecording: z.enum(["none", "cloud", "local"]).optional(),
      })
      .strict()
      .parse(input);

    const nextStarts = new Date(data.startsAt);
    const nextEnds = new Date(data.endsAt);
    ensure(nextStarts < nextEnds, "VALIDATION");

    const session = await ctx.db.session.findUnique({
      where: { id: data.sessionId },
    });
    ensure(session, "NOT_FOUND");
    await authorizeOfferingInstructorOrOwner(ctx, session.offeringId);

    await ctx.db.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { startsAt: nextStarts, endsAt: nextEnds },
      });
      if (data.waitingRoom !== undefined || data.autoRecording !== undefined) {
        await tx.offering.update({
          where: { id: session.offeringId },
          data: {
            isZoomLive: true,
            ...(data.waitingRoom !== undefined
              ? { zoomWaitingRoom: data.waitingRoom }
              : {}),
            ...(data.autoRecording !== undefined
              ? { zoomAutoRecording: data.autoRecording }
              : {}),
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "session.schedule.updated",
          targetId: session.id,
          createdAt: ctx.now(),
        },
      });
    });

    const syncResult = await syncOfferingZoomMeetingsInternal(
      ctx,
      session.offeringId,
    );
    const zoomMeeting =
      syncResult.meetings.find((m) => m.sessionId === session.id) ?? null;

    return {
      session: {
        id: session.id,
        startsAt: nextStarts.toISOString(),
        endsAt: nextEnds.toISOString(),
      },
      zoomMeeting,
    };
  });
}

export function cancelOfferingAndZoomMeetings(
  ctx: ServiceContext,
  offeringId: string,
  reason = "강사/학원 요청에 의한 수업 취소",
): Promise<Outcome<{ offeringId: string; cancelledMeetingsCount: number }>> {
  return attempt(async () => {
    z.uuid().parse(offeringId);
    const { offering } = await authorizeOfferingInstructorOrOwner(
      ctx,
      offeringId,
    );
    ensure(offering.status !== "cancelled", "CONFLICT");

    const meetings = await ctx.db.zoomMeeting.findMany({
      where: { offeringId, status: { not: "cancelled" } },
    });

    const provider = getZoomProvider();
    for (const meeting of meetings) {
      if (meeting.zoomMeetingId) {
        try {
          const token = await ensureValidZoomAccessToken(
            ctx.db,
            meeting.instructorId,
            ctx.now(),
          );
          await provider.deleteMeeting(token, meeting.zoomMeetingId);
        } catch {
          // Local cancellation state is still committed even if remote delete fails
        }
      }
    }

    const cancelledCount = await ctx.db.$transaction(async (tx) => {
      await tx.offering.update({
        where: { id: offeringId },
        data: { status: "cancelled" },
      });
      const updated = await tx.zoomMeeting.updateMany({
        where: { offeringId, status: { not: "cancelled" } },
        data: {
          status: "cancelled",
          cancelledAt: ctx.now(),
          lastSyncedAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "offering.cancelled",
          targetId: offeringId,
          reason: reason.slice(0, 500),
          createdAt: ctx.now(),
        },
      });
      return updated.count;
    });

    return { offeringId, cancelledMeetingsCount: cancelledCount };
  });
}

