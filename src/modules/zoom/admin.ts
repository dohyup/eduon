import "server-only";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure, type Outcome } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { formatSanitizedZoomAccount } from "./account";
import { toZoomMeetingSummary } from "./meetings";

export function getAdminZoomDashboard(
  ctx: ServiceContext,
): Promise<
  Outcome<{
    summary: {
      connectedInstructorsCount: number;
      reauthRequiredCount: number;
      scheduledMeetingsCount: number;
      syncFailedMeetingsCount: number;
      needsAdminReviewMeetingsCount: number;
      failedWebhooksCount: number;
      totalRecordingsCount: number;
    };
    instructorAccounts: Array<{
      userId: string;
      instructorEmail: string;
      account: ReturnType<typeof formatSanitizedZoomAccount>;
    }>;
    meetings: Array<{
      meeting: ReturnType<typeof toZoomMeetingSummary>;
      courseTitle: string;
      academyName: string;
      instructorEmail: string;
      startsAt: string;
      endsAt: string;
    }>;
    attendanceRecords: Array<{
      id: string;
      sessionId: string;
      courseTitle: string;
      studentId: string;
      studentName: string;
      status: string;
      totalSeconds: number;
      attendanceRate: number;
      source: string;
      calculatedAt: string;
    }>;
    webhookEvents: Array<{
      id: string;
      eventId: string;
      eventType: string;
      status: string;
      attempts: number;
      errorMessage: string | null;
      receivedAt: string;
      processedAt: string | null;
    }>;
    recordings: Array<{
      id: string;
      sessionId: string;
      courseTitle: string;
      zoomRecordingFileId: string;
      fileType: string;
      fileSize: number;
      durationSeconds: number;
      isPublic: boolean;
      status: string;
      createdAt: string;
    }>;
  }>
> {
  return attempt(async () => {
    const admin = await requireActor(ctx);
    ensure(admin.platformAdmin, "FORBIDDEN");

    const now = ctx.now();
    const [
      accounts,
      meetings,
      attendanceRecords,
      webhookEvents,
      recordings,
    ] = await Promise.all([
      ctx.db.zoomAccount.findMany({
        include: { user: { select: { id: true, email: true } } },
        orderBy: { lastSyncedAt: "desc" },
        take: 50,
      }),
      ctx.db.zoomMeeting.findMany({
        include: {
          session: true,
          offering: {
            include: {
              course: { select: { title: true } },
              academy: { select: { name: true } },
            },
          },
          instructor: { select: { email: true } },
        },
        orderBy: { lastSyncedAt: "desc" },
        take: 50,
      }),
      ctx.db.attendanceRecord.findMany({
        include: {
          student: { select: { id: true, name: true } },
          session: {
            include: {
              offering: {
                include: { course: { select: { title: true } } },
              },
            },
          },
        },
        orderBy: { calculatedAt: "desc" },
        take: 50,
      }),
      ctx.db.zoomWebhookEvent.findMany({
        orderBy: { receivedAt: "desc" },
        take: 50,
      }),
      ctx.db.zoomRecording.findMany({
        include: {
          session: {
            include: {
              offering: {
                include: { course: { select: { title: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      summary: {
        connectedInstructorsCount: accounts.filter(
          (a) => a.status === "connected",
        ).length,
        reauthRequiredCount: accounts.filter(
          (a) => a.status === "reauth_required" || a.status === "error",
        ).length,
        scheduledMeetingsCount: meetings.filter(
          (m) => m.status === "scheduled" || m.status === "started",
        ).length,
        syncFailedMeetingsCount: meetings.filter(
          (m) => m.status === "sync_failed",
        ).length,
        needsAdminReviewMeetingsCount: meetings.filter(
          (m) => m.status === "needs_admin_review",
        ).length,
        failedWebhooksCount: webhookEvents.filter(
          (e) => e.status === "failed",
        ).length,
        totalRecordingsCount: recordings.length,
      },
      instructorAccounts: accounts.map((a) => ({
        userId: a.userId,
        instructorEmail: a.user.email,
        account: formatSanitizedZoomAccount(a, now),
      })),
      meetings: meetings.map((m) => ({
        meeting: toZoomMeetingSummary(m),
        courseTitle: m.offering.course.title,
        academyName: m.offering.academy.name,
        instructorEmail: m.instructor.email,
        startsAt: m.session.startsAt.toISOString(),
        endsAt: m.session.endsAt.toISOString(),
      })),
      attendanceRecords: attendanceRecords.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        courseTitle: r.session.offering.course.title,
        studentId: r.studentId,
        studentName: r.student.name,
        status: r.status,
        totalSeconds: r.totalSeconds,
        attendanceRate: r.attendanceRate,
        source: r.source,
        calculatedAt: r.calculatedAt.toISOString(),
      })),
      webhookEvents: webhookEvents.map((e) => ({
        id: e.id,
        eventId: e.eventId,
        eventType: e.eventType,
        status: e.status,
        attempts: e.attempts,
        errorMessage: e.errorMessage,
        receivedAt: e.receivedAt.toISOString(),
        processedAt: e.processedAt ? e.processedAt.toISOString() : null,
      })),
      recordings: recordings.map((rec) => ({
        id: rec.id,
        sessionId: rec.sessionId,
        courseTitle: rec.session.offering.course.title,
        zoomRecordingFileId: rec.zoomRecordingFileId,
        fileType: rec.fileType,
        fileSize: rec.fileSize,
        durationSeconds: rec.durationSeconds,
        isPublic: rec.isPublic,
        status: rec.status,
        createdAt: rec.createdAt.toISOString(),
      })),
    };
  });
}

