import "server-only";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import { AppError, attempt, ensure, type Outcome } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import {
  zoomExternalSdkApproved,
  zoomSdkConfigured,
} from "@/server/config";
import {
  createZoomSdkSignature,
  decryptZoomSecret,
} from "@/integrations/zoom/crypto";
import { getZoomProvider } from "@/integrations/zoom/provider";
import { ensureValidZoomAccessToken } from "./account";
import {
  syncOfferingZoomMeetingsInternal,
  toZoomMeetingSummary,
  type ZoomMeetingSummary,
} from "./meetings";

const EARLY_JOIN_WINDOW_MS = 10 * 60 * 1000; // 수업 시작 10분 전부터 입장 허용
const LATE_JOIN_GRACE_MS = 15 * 60 * 1000; // 수업 종료 후 15분까지 진행 중 입장 유예

export type ClassroomJoinTicket = {
  role: "host" | "attendee";
  joinMode: "sdk_and_external" | "external_only";
  externalSdkApproved: boolean;
  sdkNotice: string;
  sessionId: string;
  offeringId: string;
  courseTitle: string;
  startsAt: string;
  endsAt: string;
  meetingStatus: string;
  recordingConsentRequired: boolean;
  externalJoinUrl: string;
  sdk: {
    sdkKey: string;
    signature: string;
    meetingNumber: string;
    password: string;
    userName: string;
    userEmail?: string;
    zak?: string;
    customerKey?: string;
    role: 0 | 1;
  } | null;
};

function buildSafeExternalJoinUrl(
  baseJoinUrl: string,
  params: { userName: string; customerKey?: string; zak?: string },
): string {
  try {
    const url = new URL(baseJoinUrl);
    if (!url.hostname.endsWith("zoom.us")) {
      throw new Error("UNTRUSTED_ZOOM_HOST");
    }
    if (params.userName) url.searchParams.set("uname", params.userName);
    if (params.customerKey)
      url.searchParams.set("customer_key", params.customerKey);
    if (params.zak) url.searchParams.set("zak", params.zak);
    return url.toString();
  } catch {
    return baseJoinUrl;
  }
}

export function startZoomSessionByHost(
  ctx: ServiceContext,
  sessionId: string,
): Promise<Outcome<ClassroomJoinTicket>> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    z.uuid().parse(sessionId);

    const session = await ctx.db.session.findUnique({
      where: { id: sessionId },
      include: {
        offering: {
          include: {
            course: true,
            instructors: true,
          },
        },
        zoomMeeting: true,
      },
    });
    ensure(session, "NOT_FOUND");
    ensure(session.offering.status !== "cancelled", "CONFLICT");

    const membership = await ctx.db.academyMembership.findUnique({
      where: {
        academyId_userId: {
          academyId: session.academyId,
          userId: actor.id,
        },
      },
    });
    const isAssignedInstructor =
      Boolean(membership?.active) &&
      session.offering.instructors.some((i) => i.userId === actor.id);
    ensure(isAssignedInstructor, "FORBIDDEN");

    let meeting = session.zoomMeeting;
    if (!meeting || !meeting.zoomMeetingId || meeting.status === "sync_failed") {
      if (!session.offering.isZoomLive) {
        await ctx.db.offering.update({
          where: { id: session.offeringId },
          data: { isZoomLive: true },
        });
      }
      await syncOfferingZoomMeetingsInternal(ctx, session.offeringId);
      meeting = await ctx.db.zoomMeeting.findUnique({
        where: { sessionId: session.id },
      });
    }
    ensure(
      meeting &&
        meeting.zoomMeetingId &&
        meeting.status !== "cancelled" &&
        meeting.status !== "sync_failed",
      "CONFLICT",
    );

    const zoomAccount = await ctx.db.zoomAccount.findUnique({
      where: { userId: actor.id },
    });
    ensure(zoomAccount && zoomAccount.status === "connected", "CONFLICT");
    ensure(zoomAccount.zoomUserId === meeting.zoomHostId, "FORBIDDEN");

    const accessToken = await ensureValidZoomAccessToken(
      ctx.db,
      actor.id,
      ctx.now(),
    );
    const { zak } = await getZoomProvider().getHostZakToken(accessToken);

    const updatedMeeting = await ctx.db.$transaction(async (tx) => {
      const row = await tx.zoomMeeting.update({
        where: { id: meeting.id },
        data: {
          status: "started",
          startedAt: meeting.startedAt ?? ctx.now(),
          lastSyncedAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "zoom.session.host_started",
          targetId: session.id,
          reason: `meetingId:${meeting.zoomMeetingId}`,
          createdAt: ctx.now(),
        },
      });
      return row;
    });

    const password = updatedMeeting.encryptedPassword
      ? decryptZoomSecret(updatedMeeting.encryptedPassword)
      : "";
    const hostDisplayName =
      zoomAccount.zoomDisplayName || actor.email.split("@")[0] || "담당 강사";
    const externalJoinUrl = buildSafeExternalJoinUrl(updatedMeeting.joinUrl, {
      userName: hostDisplayName,
      zak,
    });

    const sdkReady = zoomSdkConfigured();
    const sdkKey = process.env.ZOOM_SDK_KEY || "eduon-dev-sdk-key";
    const sdkSecret =
      process.env.ZOOM_SDK_SECRET || "eduon-dev-sdk-secret-32bytes-minimum";

    const signature = createZoomSdkSignature({
      sdkKey,
      sdkSecret,
      meetingNumber: updatedMeeting.zoomMeetingId,
      role: 1,
      now: ctx.now(),
    });

    return {
      role: "host",
      joinMode: sdkReady ? "sdk_and_external" : "external_only",
      externalSdkApproved: zoomExternalSdkApproved(),
      sdkNotice: sdkReady
        ? "호스트(강사) ZAK 및 Meeting SDK 서명이 발급되었습니다."
        : "Zoom Meeting SDK 키가 설정되지 않아 Zoom 앱/브라우저 호스트 시작 경로로 연결합니다.",
      sessionId: session.id,
      offeringId: session.offeringId,
      courseTitle: session.offering.course.title,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      meetingStatus: updatedMeeting.status,
      recordingConsentRequired: updatedMeeting.recordingConsentRequired,
      externalJoinUrl,
      sdk: {
        sdkKey,
        signature,
        meetingNumber: updatedMeeting.zoomMeetingId,
        password,
        userName: hostDisplayName,
        userEmail: actor.email,
        zak,
        role: 1,
      },
    };
  });
}

export function joinZoomSessionByStudent(
  ctx: ServiceContext,
  sessionId: string,
  options: { recordingConsentAgreed?: boolean } = {},
): Promise<Outcome<ClassroomJoinTicket>> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    z.uuid().parse(sessionId);

    // Must be a bound student account (parents/other users cannot receive student join tickets)
    const student = await ctx.db.studentProfile.findUnique({
      where: { accountUserId: actor.id },
    });
    ensure(student, "FORBIDDEN");

    const session = await ctx.db.session.findUnique({
      where: { id: sessionId },
      include: {
        offering: {
          include: {
            course: true,
          },
        },
        zoomMeeting: true,
      },
    });
    ensure(session, "NOT_FOUND");
    ensure(
      session.offering.status === "published" ||
        session.offering.status === "closed",
      "FORBIDDEN",
    );

    // Verify active enrollment and expiration policy
    const enrollment = await ctx.db.enrollment.findUnique({
      where: {
        offeringId_studentId: {
          offeringId: session.offeringId,
          studentId: student.id,
        },
      },
    });
    ensure(enrollment && enrollment.status === "active", "FORBIDDEN");
    if (enrollment.expiresAt && enrollment.expiresAt <= ctx.now()) {
      throw new AppError("EXPIRED");
    }

    // Verify entry time window (10 minutes before startsAt until 15 minutes after endsAt)
    const nowMs = ctx.now().getTime();
    const windowOpenMs = session.startsAt.getTime() - EARLY_JOIN_WINDOW_MS;
    const windowCloseMs = session.endsAt.getTime() + LATE_JOIN_GRACE_MS;
    ensure(nowMs >= windowOpenMs && nowMs <= windowCloseMs, "FORBIDDEN");

    const meeting = session.zoomMeeting;
    ensure(
      meeting &&
        meeting.zoomMeetingId &&
        meeting.joinUrl &&
        meeting.status !== "cancelled" &&
        meeting.status !== "ended" &&
        meeting.status !== "sync_failed",
      "CONFLICT",
    );

    if (
      meeting.recordingConsentRequired &&
      options.recordingConsentAgreed === false
    ) {
      throw new AppError("VALIDATION");
    }

    const password = meeting.encryptedPassword
      ? decryptZoomSecret(meeting.encryptedPassword)
      : "";
    const externalJoinUrl = buildSafeExternalJoinUrl(meeting.joinUrl, {
      userName: student.name,
      customerKey: student.id,
    });

    // 2026 Zoom External Meeting SDK Policy Check:
    // Joining an instructor's external personal Zoom meeting via Meeting SDK requires
    // Marketplace App Review approval + SDK credentials. Never bypass SDK restrictions!
    const approvedForExternalSdk = zoomExternalSdkApproved();

    let sdkPayload: ClassroomJoinTicket["sdk"] = null;
    if (approvedForExternalSdk) {
      const sdkKey = process.env.ZOOM_SDK_KEY!;
      const sdkSecret = process.env.ZOOM_SDK_SECRET!;
      const signature = createZoomSdkSignature({
        sdkKey,
        sdkSecret,
        meetingNumber: meeting.zoomMeetingId,
        role: 0, // Student is NEVER granted host role (role=0 strictly enforced)
        now: ctx.now(),
      });
      sdkPayload = {
        sdkKey,
        signature,
        meetingNumber: meeting.zoomMeetingId,
        password,
        userName: student.name,
        userEmail: actor.email,
        customerKey: student.id,
        role: 0,
      };
    }

    await ctx.db.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "zoom.session.student_join_issued",
        targetId: session.id,
        reason: `studentId:${student.id},mode:${approvedForExternalSdk ? "sdk" : "external"}`,
        createdAt: ctx.now(),
      },
    });

    return {
      role: "attendee",
      joinMode: approvedForExternalSdk ? "sdk_and_external" : "external_only",
      externalSdkApproved: approvedForExternalSdk,
      sdkNotice: approvedForExternalSdk
        ? "Zoom Marketplace 외부 회의 SDK 승인이 확인되어 강의실 내장 화면(Component View) 및 외부 앱 입장을 모두 지원합니다."
        : "2026년 Zoom 외부 호스트 회의 보안 정책에 따라 Zoom 앱 또는 공식 웹 브라우저로 안전하게 입장합니다.",
      sessionId: session.id,
      offeringId: session.offeringId,
      courseTitle: session.offering.course.title,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      meetingStatus: meeting.status,
      recordingConsentRequired: meeting.recordingConsentRequired,
      externalJoinUrl,
      sdk: sdkPayload,
    };
  });
}

export function createSessionMaterial(
  ctx: ServiceContext,
  input: {
    sessionId: string;
    title: string;
    description?: string;
    fileName: string;
    content: string;
  },
): Promise<Outcome<{ materialId: string }>> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    const data = z
      .object({
        sessionId: z.uuid(),
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().max(500).optional(),
        fileName: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[a-zA-Z0-9가-힣._ -]+$/),
        content: z.string().trim().min(1).max(10000),
      })
      .strict()
      .parse(input);

    const session = await ctx.db.session.findUnique({
      where: { id: data.sessionId },
      include: { offering: { include: { instructors: true } } },
    });
    ensure(session, "NOT_FOUND");
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

    const material = await ctx.db.$transaction(async (tx) => {
      const row = await tx.sessionMaterial.create({
        data: {
          sessionId: session.id,
          title: data.title,
          description: data.description,
          fileName: data.fileName,
          content: data.content,
          createdById: actor.id,
          createdAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "session.material.created",
          targetId: row.id,
          createdAt: ctx.now(),
        },
      });
      return row;
    });

    return { materialId: material.id };
  });
}

export function getClassroomState(
  ctx: ServiceContext,
  offeringOrSessionId: string,
): Promise<
  Outcome<{
    offering: {
      id: string;
      academyId: string;
      academyName: string;
      title: string;
      subject: string;
      status: string;
      isZoomLive: boolean;
      zoomWaitingRoom: boolean;
      zoomAutoRecording: string;
      instructorNames: string[];
    };
    viewerRole: "instructor" | "owner" | "student" | "guardian" | "admin";
    canStartHost: boolean;
    canJoinStudent: boolean;
    studentEnrollmentStatus: string | null;
    sessions: Array<{
      id: string;
      startsAt: string;
      endsAt: string;
      windowState: "waiting_before_window" | "open" | "ended";
      minutesUntilOpen: number;
      zoomMeeting: ZoomMeetingSummary | null;
      materials: Array<{
        id: string;
        title: string;
        description: string | null;
        fileName: string;
        content: string;
        createdAt: string;
      }>;
      myAttendance: {
        status: string;
        totalSeconds: number;
        attendanceRate: number;
        firstJoinedAt: string | null;
        lastLeftAt: string | null;
      } | null;
      attendanceSummary: Array<{
        studentId: string;
        studentName: string;
        status: string;
        totalSeconds: number;
        attendanceRate: number;
        source: string;
        firstJoinedAt: string | null;
        lastLeftAt: string | null;
      }>;
      recordings: Array<{
        id: string;
        fileType: string;
        fileSize: number;
        durationSeconds: number;
        isPublic: boolean;
        status: string;
        recordingStart: string | null;
        recordingEnd: string | null;
      }>;
    }>;
  }>
> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    z.uuid().parse(offeringOrSessionId);

    let offeringId = offeringOrSessionId;
    const bySession = await ctx.db.session.findUnique({
      where: { id: offeringOrSessionId },
      select: { offeringId: true },
    });
    if (bySession) offeringId = bySession.offeringId;

    const offering = await ctx.db.offering.findUnique({
      where: { id: offeringId },
      include: {
        academy: true,
        course: true,
        instructors: {
          include: { instructor: { select: { id: true, email: true } } },
        },
        sessions: {
          orderBy: { startsAt: "asc" },
          include: {
            zoomMeeting: true,
            materials: { orderBy: { createdAt: "asc" } },
            attendanceRecords: {
              include: { student: { select: { id: true, name: true } } },
            },
            zoomRecordings: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
    ensure(offering, "NOT_FOUND");

    const membership = await ctx.db.academyMembership.findUnique({
      where: {
        academyId_userId: {
          academyId: offering.academyId,
          userId: actor.id,
        },
      },
    });
    const isOwner = Boolean(membership?.active && membership.role === "owner");
    const isInstructor =
      Boolean(membership?.active) &&
      offering.instructors.some((i) => i.userId === actor.id);

    const student = await ctx.db.studentProfile.findUnique({
      where: { accountUserId: actor.id },
    });
    const studentEnrollment = student
      ? await ctx.db.enrollment.findUnique({
          where: {
            offeringId_studentId: {
              offeringId: offering.id,
              studentId: student.id,
            },
          },
        })
      : null;

    const guardianEnrollments = await ctx.db.enrollment.findMany({
      where: {
        offeringId: offering.id,
        student: {
          guardians: {
            some: { guardianId: actor.id, revokedAt: null },
          },
        },
      },
      include: { student: true },
    });

    const isStudentWithAccess =
      Boolean(studentEnrollment) &&
      (studentEnrollment?.status === "active" ||
        studentEnrollment?.status === "completed") &&
      (!studentEnrollment?.expiresAt ||
        studentEnrollment.expiresAt > ctx.now());
    const isGuardianWithAccess = guardianEnrollments.length > 0;

    ensure(
      actor.platformAdmin ||
        isOwner ||
        isInstructor ||
        isStudentWithAccess ||
        isGuardianWithAccess,
      "FORBIDDEN",
    );

    const viewerRole = actor.platformAdmin
      ? "admin"
      : isInstructor
        ? "instructor"
        : isOwner
          ? "owner"
          : isStudentWithAccess
            ? "student"
            : "guardian";

    const canManageStaff = actor.platformAdmin || isOwner || isInstructor;
    const nowMs = ctx.now().getTime();
    const targetStudentId =
      student?.id ?? guardianEnrollments[0]?.studentId ?? null;

    return {
      offering: {
        id: offering.id,
        academyId: offering.academyId,
        academyName: offering.academy.name,
        title: offering.course.title,
        subject: offering.course.subject,
        status: offering.status,
        isZoomLive: offering.isZoomLive,
        zoomWaitingRoom: offering.zoomWaitingRoom,
        zoomAutoRecording: offering.zoomAutoRecording,
        instructorNames: offering.instructors.map(
          (i) => i.instructor.email.split("@")[0] + " 선생님",
        ),
      },
      viewerRole,
      canStartHost: isInstructor,
      canJoinStudent:
        Boolean(student) &&
        studentEnrollment?.status === "active" &&
        (!studentEnrollment.expiresAt ||
          studentEnrollment.expiresAt > ctx.now()),
      studentEnrollmentStatus: studentEnrollment?.status ?? null,
      sessions: offering.sessions.map((s) => {
        const openMs = s.startsAt.getTime() - EARLY_JOIN_WINDOW_MS;
        const closeMs = s.endsAt.getTime() + LATE_JOIN_GRACE_MS;
        const windowState: "waiting_before_window" | "open" | "ended" =
          s.zoomMeeting?.status === "ended" || nowMs > closeMs
            ? "ended"
            : nowMs < openMs
              ? "waiting_before_window"
              : "open";
        const minutesUntilOpen =
          nowMs < openMs ? Math.ceil((openMs - nowMs) / 60000) : 0;

        const ownRecord = targetStudentId
          ? s.attendanceRecords.find((r) => r.studentId === targetStudentId)
          : null;

        return {
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          windowState,
          minutesUntilOpen,
          zoomMeeting: s.zoomMeeting
            ? toZoomMeetingSummary(s.zoomMeeting)
            : null,
          materials: s.materials.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            fileName: m.fileName,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })),
          myAttendance: ownRecord
            ? {
                status: ownRecord.status,
                totalSeconds: ownRecord.totalSeconds,
                attendanceRate: ownRecord.attendanceRate,
                firstJoinedAt: ownRecord.firstJoinedAt
                  ? ownRecord.firstJoinedAt.toISOString()
                  : null,
                lastLeftAt: ownRecord.lastLeftAt
                  ? ownRecord.lastLeftAt.toISOString()
                  : null,
              }
            : null,
          attendanceSummary: canManageStaff
            ? s.attendanceRecords.map((r) => ({
                studentId: r.studentId,
                studentName: r.student.name,
                status: r.status,
                totalSeconds: r.totalSeconds,
                attendanceRate: r.attendanceRate,
                source: r.source,
                firstJoinedAt: r.firstJoinedAt
                  ? r.firstJoinedAt.toISOString()
                  : null,
                lastLeftAt: r.lastLeftAt ? r.lastLeftAt.toISOString() : null,
              }))
            : [],
          recordings: s.zoomRecordings
            .filter(
              (rec) =>
                rec.status !== "deleted" && (canManageStaff || rec.isPublic),
            )
            .map((rec) => ({
              id: rec.id,
              fileType: rec.fileType,
              fileSize: rec.fileSize,
              durationSeconds: rec.durationSeconds,
              isPublic: rec.isPublic,
              status: rec.status,
              recordingStart: rec.recordingStart
                ? rec.recordingStart.toISOString()
                : null,
              recordingEnd: rec.recordingEnd
                ? rec.recordingEnd.toISOString()
                : null,
            })),
        };
      }),
    };
  });
}

