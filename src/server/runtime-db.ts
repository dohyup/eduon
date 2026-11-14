import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { encryptZoomSecret } from "@/integrations/zoom/crypto";

type Row = Record<string, unknown>;

interface RuntimeStoreData {
  user: Row[];
  academy: Row[];
  academyMembership: Row[];
  studentProfile: Row[];
  guardianLink: Row[];
  studentInvitation: Row[];
  instructorInvitation: Row[];
  course: Row[];
  offering: Row[];
  session: Row[];
  instructorAssignment: Row[];
  enrollment: Row[];
  auditEvent: Row[];
  rateLimit: Row[];
  recommendationEvent: Row[];
  zoomAccount: Row[];
  zoomOAuthState: Row[];
  zoomMeeting: Row[];
  zoomAttendanceSession: Row[];
  attendanceRecord: Row[];
  zoomRecording: Row[];
  zoomWebhookEvent: Row[];
  sessionMaterial: Row[];
}

export const SEED_ADMIN_ID = "00000000-0000-4000-8000-000000000001";
export const SEED_SECOND_ADMIN_ID = "68015ac2-b4db-4ba6-9631-6d07bbf3f0aa";
export const SEED_ACADEMY_ID = "10000000-0000-4000-8000-000000000001";
export const SEED_STUDENT_ID = "20000000-0000-4000-8000-000000000001";
export const SEED_COURSE_MATH_ID = "30000000-0000-4000-8000-000000000001";
export const SEED_COURSE_ENG_ID = "30000000-0000-4000-8000-000000000002";
export const SEED_OFFERING_MATH_ID = "40000000-0000-4000-8000-000000000001";
export const SEED_OFFERING_ENG_ID = "40000000-0000-4000-8000-000000000002";
export const SEED_SESSION_MATH_1_ID = "50000000-0000-4000-8000-000000000001";
export const SEED_SESSION_MATH_2_ID = "50000000-0000-4000-8000-000000000002";
export const SEED_SESSION_ENG_1_ID = "50000000-0000-4000-8000-000000000003";

function createInitialStore(): RuntimeStoreData {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const encAccess = encryptZoomSecret("mock-access-seed-instructor-token");
  const encRefresh = encryptZoomSecret("mock-refresh-seed-instructor-token");
  const encPass = encryptZoomSecret("123456");
  const encPlayUrl = encryptZoomSecret(
    "https://zoom.us/rec/play/eduon-math-live-session-replay",
  );
  const encDownloadUrl = encryptZoomSecret(
    "https://zoom.us/rec/download/eduon-math-live-session-replay",
  );

  const zoomAcc1Id = "60000000-0000-4000-8000-000000000001";
  const zoomAcc2Id = "60000000-0000-4000-8000-000000000002";
  const zoomMtg1Id = "70000000-0000-4000-8000-000000000001";
  const zoomMtg2Id = "70000000-0000-4000-8000-000000000002";
  const zoomMtg3Id = "70000000-0000-4000-8000-000000000003";
  const enroll1Id = "80000000-0000-4000-8000-000000000001";
  const enroll2Id = "80000000-0000-4000-8000-000000000002";

  return {
    user: [
      {
        id: SEED_ADMIN_ID,
        email: "admin@eduon.kr",
        platformAdmin: true,
        guardianVerifiedAt: now,
        disabledAt: null,
        createdAt: lastWeek,
      },
      {
        id: SEED_SECOND_ADMIN_ID,
        email: "darkpon@naver.com",
        platformAdmin: true,
        guardianVerifiedAt: now,
        disabledAt: null,
        createdAt: lastWeek,
      },
    ],
    academy: [
      {
        id: SEED_ACADEMY_ID,
        name: "에듀온 라이브 아카데미",
        region: "서울 강남 · 실시간 화상",
        status: "approved",
        decisionReason: "정식 승인된 실시간 Zoom 화상강의 운영 학원",
        createdAt: lastWeek,
      },
    ],
    academyMembership: [
      {
        id: "11000000-0000-4000-8000-000000000001",
        academyId: SEED_ACADEMY_ID,
        userId: SEED_ADMIN_ID,
        role: "owner",
        active: true,
      },
      {
        id: "11000000-0000-4000-8000-000000000002",
        academyId: SEED_ACADEMY_ID,
        userId: SEED_SECOND_ADMIN_ID,
        role: "owner",
        active: true,
      },
    ],
    studentProfile: [
      {
        id: SEED_STUDENT_ID,
        name: "김가람",
        grade: 5,
        accountUserId: SEED_ADMIN_ID,
        createdAt: lastWeek,
      },
    ],
    guardianLink: [
      {
        id: "21000000-0000-4000-8000-000000000001",
        guardianId: SEED_ADMIN_ID,
        studentId: SEED_STUDENT_ID,
        verifiedAt: lastWeek,
        revokedAt: null,
      },
      {
        id: "21000000-0000-4000-8000-000000000002",
        guardianId: SEED_SECOND_ADMIN_ID,
        studentId: SEED_STUDENT_ID,
        verifiedAt: lastWeek,
        revokedAt: null,
      },
    ],
    studentInvitation: [],
    instructorInvitation: [],
    course: [
      {
        id: SEED_COURSE_MATH_ID,
        academyId: SEED_ACADEMY_ID,
        title: "[Zoom 실시간] 개념이 보이는 초등 사고력 수학 라이브",
        subject: "math",
        gradeMin: 4,
        gradeMax: 6,
        level: "intermediate",
      },
      {
        id: SEED_COURSE_ENG_ID,
        academyId: SEED_ACADEMY_ID,
        title: "[Zoom 실시간] 스스로 말하고 읽는 영어 리딩 스튜디오",
        subject: "english",
        gradeMin: 3,
        gradeMax: 6,
        level: "beginner",
      },
    ],
    offering: [
      {
        id: SEED_OFFERING_MATH_ID,
        courseId: SEED_COURSE_MATH_ID,
        academyId: SEED_ACADEMY_ID,
        status: "published",
        priceWon: 120000,
        capacity: 12,
        enrollmentOpensAt: lastWeek,
        enrollmentClosesAt: nextMonth,
        purchaseLockedAt: null,
        isZoomLive: true,
        zoomWaitingRoom: true,
        zoomAutoRecording: "cloud",
        createdAt: lastWeek,
      },
      {
        id: SEED_OFFERING_ENG_ID,
        courseId: SEED_COURSE_ENG_ID,
        academyId: SEED_ACADEMY_ID,
        status: "published",
        priceWon: 140000,
        capacity: 10,
        enrollmentOpensAt: lastWeek,
        enrollmentClosesAt: nextMonth,
        purchaseLockedAt: null,
        isZoomLive: true,
        zoomWaitingRoom: true,
        zoomAutoRecording: "cloud",
        createdAt: lastWeek,
      },
    ],
    session: [
      {
        id: SEED_SESSION_MATH_1_ID,
        offeringId: SEED_OFFERING_MATH_ID,
        academyId: SEED_ACADEMY_ID,
        startsAt: fiveMinutesAgo,
        endsAt: twoHoursLater,
      },
      {
        id: SEED_SESSION_MATH_2_ID,
        offeringId: SEED_OFFERING_MATH_ID,
        academyId: SEED_ACADEMY_ID,
        startsAt: twoHoursAgo,
        endsAt: oneHourAgo,
      },
      {
        id: SEED_SESSION_ENG_1_ID,
        offeringId: SEED_OFFERING_ENG_ID,
        academyId: SEED_ACADEMY_ID,
        startsAt: tomorrow,
        endsAt: tomorrowEnd,
      },
    ],
    instructorAssignment: [
      {
        id: "55000000-0000-4000-8000-000000000001",
        offeringId: SEED_OFFERING_MATH_ID,
        userId: SEED_ADMIN_ID,
      },
      {
        id: "55000000-0000-4000-8000-000000000002",
        offeringId: SEED_OFFERING_MATH_ID,
        userId: SEED_SECOND_ADMIN_ID,
      },
      {
        id: "55000000-0000-4000-8000-000000000003",
        offeringId: SEED_OFFERING_ENG_ID,
        userId: SEED_ADMIN_ID,
      },
    ],
    enrollment: [
      {
        id: enroll1Id,
        offeringId: SEED_OFFERING_MATH_ID,
        studentId: SEED_STUDENT_ID,
        status: "active",
        expiresAt: nextMonth,
      },
      {
        id: enroll2Id,
        offeringId: SEED_OFFERING_ENG_ID,
        studentId: SEED_STUDENT_ID,
        status: "active",
        expiresAt: nextMonth,
      },
    ],
    auditEvent: [],
    rateLimit: [],
    recommendationEvent: [],
    zoomAccount: [
      {
        id: zoomAcc1Id,
        userId: SEED_ADMIN_ID,
        zoomUserId: "zoom-host-5f0d97dc79",
        zoomEmail: "admin@eduon.kr",
        zoomDisplayName: "에듀온 대표강사",
        accountType: 2,
        cloudRecordingAllowed: true,
        encryptedAccessToken: encAccess,
        encryptedRefreshToken: encRefresh,
        tokenExpiresAt: nextMonth,
        scopes:
          "user:read:user meeting:write:meeting meeting:read:meeting cloud_recording:read:list_user_recordings",
        status: "connected",
        lastErrorCode: null,
        lastErrorMessage: null,
        reconnectionNotifiedAt: null,
        lastSyncedAt: now,
        connectedAt: lastWeek,
        disconnectedAt: null,
        updatedAt: now,
      },
      {
        id: zoomAcc2Id,
        userId: SEED_SECOND_ADMIN_ID,
        zoomUserId: "zoom-host-5f0d97dc79",
        zoomEmail: "darkpon@naver.com",
        zoomDisplayName: "에듀온 수석강사",
        accountType: 2,
        cloudRecordingAllowed: true,
        encryptedAccessToken: encAccess,
        encryptedRefreshToken: encRefresh,
        tokenExpiresAt: nextMonth,
        scopes:
          "user:read:user meeting:write:meeting meeting:read:meeting cloud_recording:read:list_user_recordings",
        status: "connected",
        lastErrorCode: null,
        lastErrorMessage: null,
        reconnectionNotifiedAt: null,
        lastSyncedAt: now,
        connectedAt: lastWeek,
        disconnectedAt: null,
        updatedAt: now,
      },
    ],
    zoomOAuthState: [],
    zoomMeeting: [
      {
        id: zoomMtg1Id,
        sessionId: SEED_SESSION_MATH_1_ID,
        offeringId: SEED_OFFERING_MATH_ID,
        instructorId: SEED_ADMIN_ID,
        zoomAccountId: zoomAcc1Id,
        zoomMeetingId: "88012345678",
        zoomMeetingUuid: "uuid-88012345678-live",
        zoomHostId: "zoom-host-5f0d97dc79",
        joinUrl: "https://zoom.us/j/88012345678?pwd=eduon1",
        encryptedPassword: encPass,
        waitingRoom: true,
        autoRecording: "cloud",
        status: "started",
        syncError: null,
        retryCount: 0,
        recordingConsentRequired: true,
        startedAt: fiveMinutesAgo,
        endedAt: null,
        cancelledAt: null,
        lastSyncedAt: now,
        createdAt: lastWeek,
        updatedAt: now,
      },
      {
        id: zoomMtg2Id,
        sessionId: SEED_SESSION_MATH_2_ID,
        offeringId: SEED_OFFERING_MATH_ID,
        instructorId: SEED_ADMIN_ID,
        zoomAccountId: zoomAcc1Id,
        zoomMeetingId: "88012349999",
        zoomMeetingUuid: "uuid-88012349999-ended",
        zoomHostId: "zoom-host-5f0d97dc79",
        joinUrl: "https://zoom.us/j/88012349999?pwd=eduon2",
        encryptedPassword: encPass,
        waitingRoom: true,
        autoRecording: "cloud",
        status: "ended",
        syncError: null,
        retryCount: 0,
        recordingConsentRequired: true,
        startedAt: twoHoursAgo,
        endedAt: oneHourAgo,
        cancelledAt: null,
        lastSyncedAt: oneHourAgo,
        createdAt: lastWeek,
        updatedAt: oneHourAgo,
      },
      {
        id: zoomMtg3Id,
        sessionId: SEED_SESSION_ENG_1_ID,
        offeringId: SEED_OFFERING_ENG_ID,
        instructorId: SEED_ADMIN_ID,
        zoomAccountId: zoomAcc1Id,
        zoomMeetingId: "88098765432",
        zoomMeetingUuid: "uuid-88098765432-sched",
        zoomHostId: "zoom-host-5f0d97dc79",
        joinUrl: "https://zoom.us/j/88098765432?pwd=eduon3",
        encryptedPassword: encPass,
        waitingRoom: true,
        autoRecording: "cloud",
        status: "scheduled",
        syncError: null,
        retryCount: 0,
        recordingConsentRequired: true,
        startedAt: null,
        endedAt: null,
        cancelledAt: null,
        lastSyncedAt: now,
        createdAt: lastWeek,
        updatedAt: now,
      },
    ],
    zoomAttendanceSession: [
      {
        id: "91000000-0000-4000-8000-000000000001",
        sessionId: SEED_SESSION_MATH_2_ID,
        studentId: SEED_STUDENT_ID,
        zoomMeetingRowId: zoomMtg2Id,
        zoomMeetingUuid: "uuid-88012349999-ended",
        participantId: "part-seed-garam",
        participantEmail: "admin@eduon.kr",
        participantName: "김가람",
        mappingStatus: "mapped",
        joinTime: twoHoursAgo,
        leaveTime: oneHourAgo,
        durationSeconds: 3300,
        isCorrectedOnEnd: false,
        joinEventId: "evt-seed-join-1",
        leaveEventId: "evt-seed-leave-1",
        createdAt: twoHoursAgo,
        updatedAt: oneHourAgo,
      },
    ],
    attendanceRecord: [
      {
        id: "92000000-0000-4000-8000-000000000001",
        sessionId: SEED_SESSION_MATH_2_ID,
        studentId: SEED_STUDENT_ID,
        enrollmentId: enroll1Id,
        totalSeconds: 3300,
        sessionDurationSeconds: 3600,
        attendanceRate: 91.7,
        status: "present",
        source: "zoom_webhook",
        firstJoinedAt: twoHoursAgo,
        lastLeftAt: oneHourAgo,
        calculatedAt: oneHourAgo,
        manualReason: null,
        updatedById: null,
      },
    ],
    zoomRecording: [
      {
        id: "93000000-0000-4000-8000-000000000001",
        sessionId: SEED_SESSION_MATH_2_ID,
        zoomMeetingRowId: zoomMtg2Id,
        zoomMeetingUuid: "uuid-88012349999-ended",
        zoomRecordingFileId: "rec-seed-math-session-2-mp4",
        fileType: "MP4",
        recordingType: "shared_screen_with_speaker_view",
        fileSize: 52428800,
        encryptedPlayUrl: encPlayUrl,
        encryptedDownloadUrl: encDownloadUrl,
        recordingStart: twoHoursAgo,
        recordingEnd: oneHourAgo,
        durationSeconds: 3000,
        isPublic: true,
        consentNoticeConfirmed: true,
        status: "completed",
        approvedById: SEED_ADMIN_ID,
        approvedAt: oneHourAgo,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      },
    ],
    zoomWebhookEvent: [
      {
        id: "94000000-0000-4000-8000-000000000001",
        eventId: "evt-seed-recording-completed",
        eventType: "recording.completed",
        eventTs: BigInt(oneHourAgo.getTime()),
        payload: '{"event":"recording.completed","status":"processed"}',
        status: "processed",
        attempts: 1,
        errorMessage: null,
        receivedAt: oneHourAgo,
        processedAt: oneHourAgo,
      },
    ],
    sessionMaterial: [
      {
        id: "95000000-0000-4000-8000-000000000001",
        sessionId: SEED_SESSION_MATH_1_ID,
        title: "1회차 핵심 개념 노트 및 연습문제",
        description: "실시간 수업 중 함께 풀어볼 사고력 수학 워크시트",
        fileName: "math-live-worksheet-01.txt",
        content:
          "EDUON 사고력 수학 1회차 워크시트\n1. 규칙 찾기와 수열의 원리\n2. 도형 회전과 대칭 문제 풀이\n3. 나만의 풀이 과정 말하기 연습",
        createdById: SEED_ADMIN_ID,
        createdAt: lastWeek,
      },
    ],
  };
}

const DATE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "guardianVerifiedAt",
  "disabledAt",
  "verifiedAt",
  "revokedAt",
  "expiresAt",
  "consumedAt",
  "enrollmentOpensAt",
  "enrollmentClosesAt",
  "purchaseLockedAt",
  "startsAt",
  "endsAt",
  "tokenExpiresAt",
  "reconnectionNotifiedAt",
  "lastSyncedAt",
  "connectedAt",
  "disconnectedAt",
  "startedAt",
  "endedAt",
  "cancelledAt",
  "joinTime",
  "leaveTime",
  "firstJoinedAt",
  "lastLeftAt",
  "calculatedAt",
  "recordingStart",
  "recordingEnd",
  "approvedAt",
  "receivedAt",
  "processedAt",
]);

function reviveRow(row: Row): Row {
  const out: Row = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (DATE_FIELDS.has(k) && typeof v === "string") {
      out[k] = new Date(v);
    } else if (k === "eventTs" && (typeof v === "string" || typeof v === "number")) {
      out[k] = BigInt(v);
    }
  }
  return out;
}

function storeFilePath(): string {
  return path.join(os.tmpdir(), "eduon-runtime-db-v1.json");
}

const globalRuntimeDb = globalThis as unknown as {
  __eduonRuntimeStore?: RuntimeStoreData;
  __eduonRuntimeClient?: unknown;
};

function getStore(): RuntimeStoreData {
  if (!globalRuntimeDb.__eduonRuntimeStore) {
    try {
      const file = storeFilePath();
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
          keyof RuntimeStoreData,
          Row[]
        >;
        const revived = {} as RuntimeStoreData;
        for (const key of Object.keys(createInitialStore()) as Array<
          keyof RuntimeStoreData
        >) {
          revived[key] = (parsed[key] || []).map(reviveRow);
        }
        globalRuntimeDb.__eduonRuntimeStore = revived;
      }
    } catch {
      // ignore disk read errors
    }
    if (!globalRuntimeDb.__eduonRuntimeStore) {
      globalRuntimeDb.__eduonRuntimeStore = createInitialStore();
    }
  }
  // Keep seed session 1 live window fresh so instructor/student can always join immediately
  const s1 = globalRuntimeDb.__eduonRuntimeStore.session.find(
    (s) => s.id === SEED_SESSION_MATH_1_ID,
  );
  if (s1 && s1.endsAt instanceof Date && s1.endsAt.getTime() < Date.now()) {
    s1.startsAt = new Date(Date.now() - 5 * 60 * 1000);
    s1.endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  }
  return globalRuntimeDb.__eduonRuntimeStore;
}

function persistStore(): void {
  try {
    const store = globalRuntimeDb.__eduonRuntimeStore;
    if (!store) return;
    fs.writeFileSync(
      storeFilePath(),
      JSON.stringify(store, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
      "utf8",
    );
  } catch {
    // ignore read-only fs errors
  }
}

type ModelName = keyof RuntimeStoreData;

function resolveRelation(
  store: RuntimeStoreData,
  model: ModelName,
  row: Row,
  relKey: string,
): unknown {
  switch (model) {
    case "user":
      if (relKey === "memberships")
        return store.academyMembership.filter((m) => m.userId === row.id);
      if (relKey === "guardianLinks")
        return store.guardianLink.filter((g) => g.guardianId === row.id);
      if (relKey === "student")
        return (
          store.studentProfile.find((s) => s.accountUserId === row.id) ?? null
        );
      if (relKey === "assignments")
        return store.instructorAssignment.filter((a) => a.userId === row.id);
      if (relKey === "zoomAccount")
        return store.zoomAccount.find((z) => z.userId === row.id) ?? null;
      if (relKey === "zoomMeetings")
        return store.zoomMeeting.filter((m) => m.instructorId === row.id);
      break;
    case "academy":
      if (relKey === "memberships")
        return store.academyMembership.filter((m) => m.academyId === row.id);
      if (relKey === "courses")
        return store.course.filter((c) => c.academyId === row.id);
      if (relKey === "offerings")
        return store.offering.filter((o) => o.academyId === row.id);
      break;
    case "academyMembership":
      if (relKey === "academy")
        return store.academy.find((a) => a.id === row.academyId) ?? null;
      if (relKey === "user")
        return store.user.find((u) => u.id === row.userId) ?? null;
      break;
    case "studentProfile":
      if (relKey === "account")
        return store.user.find((u) => u.id === row.accountUserId) ?? null;
      if (relKey === "guardians")
        return store.guardianLink.filter((g) => g.studentId === row.id);
      if (relKey === "enrollments")
        return store.enrollment.filter((e) => e.studentId === row.id);
      if (relKey === "attendanceRecords")
        return store.attendanceRecord.filter((r) => r.studentId === row.id);
      break;
    case "guardianLink":
      if (relKey === "guardian")
        return store.user.find((u) => u.id === row.guardianId) ?? null;
      if (relKey === "student")
        return store.studentProfile.find((s) => s.id === row.studentId) ?? null;
      break;
    case "course":
      if (relKey === "academy")
        return store.academy.find((a) => a.id === row.academyId) ?? null;
      if (relKey === "offerings")
        return store.offering.filter((o) => o.courseId === row.id);
      break;
    case "offering":
      if (relKey === "course")
        return store.course.find((c) => c.id === row.courseId) ?? null;
      if (relKey === "academy")
        return store.academy.find((a) => a.id === row.academyId) ?? null;
      if (relKey === "sessions")
        return store.session.filter((s) => s.offeringId === row.id);
      if (relKey === "instructors")
        return store.instructorAssignment.filter((i) => i.offeringId === row.id);
      if (relKey === "enrollments")
        return store.enrollment.filter((e) => e.offeringId === row.id);
      if (relKey === "zoomMeetings")
        return store.zoomMeeting.filter((m) => m.offeringId === row.id);
      break;
    case "session":
      if (relKey === "offering")
        return store.offering.find((o) => o.id === row.offeringId) ?? null;
      if (relKey === "zoomMeeting")
        return store.zoomMeeting.find((m) => m.sessionId === row.id) ?? null;
      if (relKey === "zoomAttendanceSessions")
        return store.zoomAttendanceSession.filter((a) => a.sessionId === row.id);
      if (relKey === "attendanceRecords")
        return store.attendanceRecord.filter((r) => r.sessionId === row.id);
      if (relKey === "zoomRecordings")
        return store.zoomRecording.filter((r) => r.sessionId === row.id);
      if (relKey === "materials")
        return store.sessionMaterial.filter((m) => m.sessionId === row.id);
      break;
    case "instructorAssignment":
      if (relKey === "offering")
        return store.offering.find((o) => o.id === row.offeringId) ?? null;
      if (relKey === "instructor")
        return store.user.find((u) => u.id === row.userId) ?? null;
      break;
    case "enrollment":
      if (relKey === "offering")
        return store.offering.find((o) => o.id === row.offeringId) ?? null;
      if (relKey === "student")
        return store.studentProfile.find((s) => s.id === row.studentId) ?? null;
      if (relKey === "attendanceRecords")
        return store.attendanceRecord.filter((r) => r.enrollmentId === row.id);
      break;
    case "zoomAccount":
      if (relKey === "user")
        return store.user.find((u) => u.id === row.userId) ?? null;
      if (relKey === "meetings")
        return store.zoomMeeting.filter((m) => m.zoomAccountId === row.id);
      break;
    case "zoomMeeting":
      if (relKey === "session")
        return store.session.find((s) => s.id === row.sessionId) ?? null;
      if (relKey === "offering")
        return store.offering.find((o) => o.id === row.offeringId) ?? null;
      if (relKey === "instructor")
        return store.user.find((u) => u.id === row.instructorId) ?? null;
      if (relKey === "zoomAccount")
        return store.zoomAccount.find((a) => a.id === row.zoomAccountId) ?? null;
      if (relKey === "attendanceSessions")
        return store.zoomAttendanceSession.filter(
          (a) => a.zoomMeetingRowId === row.id,
        );
      if (relKey === "recordings")
        return store.zoomRecording.filter((r) => r.zoomMeetingRowId === row.id);
      break;
    case "zoomAttendanceSession":
      if (relKey === "session")
        return store.session.find((s) => s.id === row.sessionId) ?? null;
      if (relKey === "student")
        return store.studentProfile.find((s) => s.id === row.studentId) ?? null;
      if (relKey === "zoomMeeting")
        return (
          store.zoomMeeting.find((m) => m.id === row.zoomMeetingRowId) ?? null
        );
      break;
    case "attendanceRecord":
      if (relKey === "session")
        return store.session.find((s) => s.id === row.sessionId) ?? null;
      if (relKey === "student")
        return store.studentProfile.find((s) => s.id === row.studentId) ?? null;
      if (relKey === "enrollment")
        return store.enrollment.find((e) => e.id === row.enrollmentId) ?? null;
      break;
    case "zoomRecording":
      if (relKey === "session")
        return store.session.find((s) => s.id === row.sessionId) ?? null;
      if (relKey === "zoomMeeting")
        return (
          store.zoomMeeting.find((m) => m.id === row.zoomMeetingRowId) ?? null
        );
      break;
    case "sessionMaterial":
      if (relKey === "session")
        return store.session.find((s) => s.id === row.sessionId) ?? null;
      break;
  }
  return undefined;
}

function targetModelForRelation(
  model: ModelName,
  relKey: string,
): ModelName | null {
  const map: Record<string, ModelName> = {
    user: "user",
    instructor: "user",
    guardian: "user",
    issuer: "user",
    account: "user",
    academy: "academy",
    memberships: "academyMembership",
    student: "studentProfile",
    guardians: "guardianLink",
    guardianLinks: "guardianLink",
    courses: "course",
    course: "course",
    offerings: "offering",
    offering: "offering",
    sessions: "session",
    session: "session",
    instructors: "instructorAssignment",
    assignments: "instructorAssignment",
    enrollments: "enrollment",
    enrollment: "enrollment",
    zoomAccount: "zoomAccount",
    zoomMeeting: "zoomMeeting",
    zoomMeetings: "zoomMeeting",
    meetings: "zoomMeeting",
    attendanceSessions: "zoomAttendanceSession",
    zoomAttendanceSessions: "zoomAttendanceSession",
    attendanceRecords: "attendanceRecord",
    recordings: "zoomRecording",
    zoomRecordings: "zoomRecording",
    materials: "sessionMaterial",
  };
  void model;
  return map[relKey] ?? null;
}

function compareValues(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (a instanceof Date && typeof b === "string")
    return a.getTime() - new Date(b).getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function matchesWhere(
  store: RuntimeStoreData,
  model: ModelName,
  row: Row,
  where?: Record<string, unknown>,
): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === "AND") {
      const list = Array.isArray(cond) ? cond : [cond];
      if (
        !list.every((item) =>
          matchesWhere(store, model, row, item as Record<string, unknown>),
        )
      )
        return false;
      continue;
    }
    if (key === "OR") {
      const list = Array.isArray(cond) ? cond : [cond];
      if (
        !list.some((item) =>
          matchesWhere(store, model, row, item as Record<string, unknown>),
        )
      )
        return false;
      continue;
    }
    if (key === "NOT") {
      const list = Array.isArray(cond) ? cond : [cond];
      if (
        list.some((item) =>
          matchesWhere(store, model, row, item as Record<string, unknown>),
        )
      )
        return false;
      continue;
    }

    // Composite unique keys like academyId_userId, offeringId_studentId, etc.
    if (
      key.includes("_") &&
      !(key in row) &&
      typeof cond === "object" &&
      cond !== null
    ) {
      if (!matchesWhere(store, model, row, cond as Record<string, unknown>))
        return false;
      continue;
    }

    const relatedModel = targetModelForRelation(model, key);
    if (
      relatedModel &&
      !(key in row) &&
      typeof cond === "object" &&
      cond !== null &&
      !(cond instanceof Date)
    ) {
      const relVal = resolveRelation(store, model, row, key);
      const condObj = cond as Record<string, unknown>;
      if (Array.isArray(relVal)) {
        if ("some" in condObj) {
          if (
            !relVal.some((item) =>
              matchesWhere(
                store,
                relatedModel,
                item as Row,
                condObj.some as Record<string, unknown>,
              ),
            )
          )
            return false;
        }
        if ("every" in condObj) {
          if (
            !relVal.every((item) =>
              matchesWhere(
                store,
                relatedModel,
                item as Row,
                condObj.every as Record<string, unknown>,
              ),
            )
          )
            return false;
        }
        if ("none" in condObj) {
          if (
            relVal.some((item) =>
              matchesWhere(
                store,
                relatedModel,
                item as Row,
                condObj.none as Record<string, unknown>,
              ),
            )
          )
            return false;
        }
      } else if (relVal) {
        if (!matchesWhere(store, relatedModel, relVal as Row, condObj))
          return false;
      } else {
        return false;
      }
      continue;
    }

    const val = row[key];
    if (
      typeof cond === "object" &&
      cond !== null &&
      !(cond instanceof Date) &&
      !Array.isArray(cond)
    ) {
      const op = cond as Record<string, unknown>;
      if ("in" in op && Array.isArray(op.in)) {
        if (!op.in.includes(val)) return false;
      }
      if ("notIn" in op && Array.isArray(op.notIn)) {
        if (op.notIn.includes(val)) return false;
      }
      if ("not" in op) {
        if (val === op.not) return false;
      }
      if ("gt" in op && compareValues(val, op.gt) <= 0) return false;
      if ("gte" in op && compareValues(val, op.gte) < 0) return false;
      if ("lt" in op && compareValues(val, op.lt) >= 0) return false;
      if ("lte" in op && compareValues(val, op.lte) > 0) return false;
      if ("contains" in op && typeof val === "string") {
        if (!val.toLowerCase().includes(String(op.contains).toLowerCase()))
          return false;
      }
    } else {
      if (val instanceof Date && cond instanceof Date) {
        if (val.getTime() !== cond.getTime()) return false;
      } else if (val !== cond) {
        return false;
      }
    }
  }
  return true;
}

function sortRows(rows: Row[], orderBy?: unknown): Row[] {
  if (!orderBy) return rows;
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      if (!spec || typeof spec !== "object") continue;
      for (const [k, dir] of Object.entries(spec as Record<string, unknown>)) {
        if (typeof dir === "string") {
          const cmp = compareValues(a[k], b[k]);
          if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
        }
      }
    }
    return 0;
  });
}

function shapeRow(
  store: RuntimeStoreData,
  model: ModelName,
  row: Row,
  args?: { include?: Record<string, unknown>; select?: Record<string, unknown> },
): Row {
  if (!args?.include && !args?.select) return { ...row };
  const base: Row = args.select ? {} : { ...row };
  const spec = (args.select ?? args.include) || {};

  for (const [key, val] of Object.entries(spec)) {
    if (!val) continue;
    if (key === "_count" && typeof val === "object" && val !== null) {
      const countSelect =
        ((val as Record<string, unknown>).select as Record<string, unknown>) ||
        {};
      const counts: Record<string, number> = {};
      for (const [cKey, cSpec] of Object.entries(countSelect)) {
        if (!cSpec) continue;
        const relItems = resolveRelation(store, model, row, cKey);
        const relModel = targetModelForRelation(model, cKey);
        if (Array.isArray(relItems)) {
          if (
            typeof cSpec === "object" &&
            cSpec !== null &&
            "where" in cSpec &&
            relModel
          ) {
            counts[cKey] = relItems.filter((item) =>
              matchesWhere(
                store,
                relModel,
                item as Row,
                (cSpec as { where?: Record<string, unknown> }).where,
              ),
            ).length;
          } else {
            counts[cKey] = relItems.length;
          }
        } else {
          counts[cKey] = relItems ? 1 : 0;
        }
      }
      base._count = counts;
      continue;
    }

    const relModel = targetModelForRelation(model, key);
    if (relModel && !(key in row)) {
      const relData = resolveRelation(store, model, row, key);
      const subArgs =
        typeof val === "object" && val !== null
          ? (val as {
              where?: Record<string, unknown>;
              orderBy?: unknown;
              take?: number;
              include?: Record<string, unknown>;
              select?: Record<string, unknown>;
            })
          : undefined;
      if (Array.isArray(relData)) {
        let list = relData as Row[];
        if (subArgs?.where) {
          list = list.filter((item) =>
            matchesWhere(store, relModel, item, subArgs.where),
          );
        }
        if (subArgs?.orderBy) {
          list = sortRows(list, subArgs.orderBy);
        }
        if (typeof subArgs?.take === "number") {
          list = list.slice(0, subArgs.take);
        }
        base[key] = list.map((item) =>
          shapeRow(store, relModel, item, subArgs),
        );
      } else if (relData) {
        base[key] = shapeRow(store, relModel, relData as Row, subArgs);
      } else {
        base[key] = null;
      }
      continue;
    }

    base[key] = row[key];
  }
  return base;
}

function applyDefaults(model: ModelName, data: Row): Row {
  const now = new Date();
  const row: Row = { ...data };
  if (model !== "rateLimit" && !row.id) row.id = randomUUID();

  switch (model) {
    case "user":
      row.platformAdmin ??= false;
      row.guardianVerifiedAt ??= now;
      row.disabledAt ??= null;
      row.createdAt ??= now;
      break;
    case "academy":
      row.status ??= "approved";
      row.decisionReason ??= null;
      row.createdAt ??= now;
      break;
    case "academyMembership":
      row.active ??= true;
      break;
    case "studentProfile":
      row.accountUserId ??= null;
      row.createdAt ??= now;
      break;
    case "guardianLink":
      row.verifiedAt ??= now;
      row.revokedAt ??= null;
      break;
    case "studentInvitation":
    case "instructorInvitation":
      row.consumedAt ??= null;
      row.revokedAt ??= null;
      break;
    case "offering":
      row.status ??= "draft";
      row.purchaseLockedAt ??= null;
      row.isZoomLive ??= false;
      row.zoomWaitingRoom ??= true;
      row.zoomAutoRecording ??= "none";
      row.createdAt ??= now;
      break;
    case "enrollment":
      row.status ??= "active";
      row.expiresAt ??= null;
      break;
    case "auditEvent":
    case "recommendationEvent":
    case "sessionMaterial":
      row.createdAt ??= now;
      break;
    case "zoomAccount":
      row.accountType ??= 2;
      row.cloudRecordingAllowed ??= true;
      row.scopes ??= "";
      row.status ??= "connected";
      row.lastErrorCode ??= null;
      row.lastErrorMessage ??= null;
      row.reconnectionNotifiedAt ??= null;
      row.lastSyncedAt ??= now;
      row.connectedAt ??= now;
      row.disconnectedAt ??= null;
      row.updatedAt ??= now;
      break;
    case "zoomOAuthState":
      row.redirectPath ??= "/instructor";
      row.consumedAt ??= null;
      row.createdAt ??= now;
      break;
    case "zoomMeeting":
      row.zoomMeetingUuid ??= null;
      row.encryptedPassword ??= null;
      row.waitingRoom ??= true;
      row.autoRecording ??= "none";
      row.status ??= "scheduled";
      row.syncError ??= null;
      row.retryCount ??= 0;
      row.recordingConsentRequired ??= false;
      row.startedAt ??= null;
      row.endedAt ??= null;
      row.cancelledAt ??= null;
      row.lastSyncedAt ??= now;
      row.createdAt ??= now;
      row.updatedAt ??= now;
      break;
    case "zoomAttendanceSession":
      row.studentId ??= null;
      row.participantEmail ??= null;
      row.participantName ??= null;
      row.mappingStatus ??= "mapped";
      row.leaveTime ??= null;
      row.durationSeconds ??= 0;
      row.isCorrectedOnEnd ??= false;
      row.joinEventId ??= null;
      row.leaveEventId ??= null;
      row.createdAt ??= now;
      row.updatedAt ??= now;
      break;
    case "attendanceRecord":
      row.enrollmentId ??= null;
      row.totalSeconds ??= 0;
      row.sessionDurationSeconds ??= 0;
      row.attendanceRate ??= 0;
      row.status ??= "pending";
      row.source ??= "zoom_webhook";
      row.firstJoinedAt ??= null;
      row.lastLeftAt ??= null;
      row.calculatedAt ??= now;
      row.manualReason ??= null;
      row.updatedById ??= null;
      break;
    case "zoomRecording":
      row.recordingType ??= "shared_screen_with_speaker_view";
      row.fileSize ??= 0;
      row.encryptedPlayUrl ??= null;
      row.encryptedDownloadUrl ??= null;
      row.recordingStart ??= null;
      row.recordingEnd ??= null;
      row.durationSeconds ??= 0;
      row.isPublic ??= false;
      row.consentNoticeConfirmed ??= true;
      row.status ??= "completed";
      row.approvedById ??= null;
      row.approvedAt ??= null;
      row.createdAt ??= now;
      row.updatedAt ??= now;
      break;
    case "zoomWebhookEvent":
      row.status ??= "pending";
      row.attempts ??= 0;
      row.errorMessage ??= null;
      row.receivedAt ??= now;
      row.processedAt ??= null;
      break;
  }
  return row;
}

function applyMutationData(target: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (
      typeof v === "object" &&
      v !== null &&
      !(v instanceof Date) &&
      !Array.isArray(v) &&
      "increment" in v
    ) {
      target[k] = Number(target[k] || 0) + Number((v as { increment: number }).increment);
    } else {
      target[k] = v;
    }
  }
  if ("updatedAt" in target) target.updatedAt = new Date();
}

function createModelDelegate(model: ModelName) {
  return {
    async findUnique(args: {
      where: Record<string, unknown>;
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) {
      const store = getStore();
      const found = store[model].find((r) =>
        matchesWhere(store, model, r, args.where),
      );
      return found ? shapeRow(store, model, found, args) : null;
    },
    async findUniqueOrThrow(args: {
      where: Record<string, unknown>;
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) {
      const row = await this.findUnique(args);
      if (!row) throw new Error(`Record not found in ${model}`);
      return row;
    },
    async findFirst(args?: {
      where?: Record<string, unknown>;
      orderBy?: unknown;
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) {
      const rows = await this.findMany({ ...args, take: 1 });
      return rows[0] ?? null;
    },
    async findMany(args?: {
      where?: Record<string, unknown>;
      orderBy?: unknown;
      take?: number;
      skip?: number;
      cursor?: Record<string, unknown>;
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) {
      const store = getStore();
      let list = store[model].filter((r) =>
        matchesWhere(store, model, r, args?.where),
      );
      list = sortRows(list, args?.orderBy);
      if (args?.cursor) {
        const idx = list.findIndex((r) =>
          matchesWhere(store, model, r, args.cursor),
        );
        if (idx >= 0) list = list.slice(idx);
      }
      if (typeof args?.skip === "number" && args.skip > 0) {
        list = list.slice(args.skip);
      }
      if (typeof args?.take === "number") {
        list = list.slice(0, args.take);
      }
      return list.map((r) => shapeRow(store, model, r, args));
    },
    async count(args?: { where?: Record<string, unknown> }) {
      const store = getStore();
      return store[model].filter((r) =>
        matchesWhere(store, model, r, args?.where),
      ).length;
    },
    async create(args: {
      data: Row;
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) {
      const store = getStore();
      const row = applyDefaults(model, args.data);
      store[model].push(row);
      persistStore();
      return shapeRow(store, model, row, args);
    },
    async createMany(args: { data: Row[] }) {
      const store = getStore();
      for (const item of args.data) {
        store[model].push(applyDefaults(model, item));
      }
      persistStore();
      return { count: args.data.length };
    },
    async update(args: {
      where: Record<string, unknown>;
      data: Row;
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) {
      const store = getStore();
      const found = store[model].find((r) =>
        matchesWhere(store, model, r, args.where),
      );
      if (!found) throw new Error(`Record to update not found in ${model}`);
      applyMutationData(found, args.data);
      persistStore();
      return shapeRow(store, model, found, args);
    },
    async updateMany(args: { where?: Record<string, unknown>; data: Row }) {
      const store = getStore();
      const matched = store[model].filter((r) =>
        matchesWhere(store, model, r, args.where),
      );
      for (const row of matched) {
        applyMutationData(row, args.data);
      }
      persistStore();
      return { count: matched.length };
    },
    async upsert(args: {
      where: Record<string, unknown>;
      create: Row;
      update: Row;
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) {
      const store = getStore();
      let found = store[model].find((r) =>
        matchesWhere(store, model, r, args.where),
      );
      if (found) {
        applyMutationData(found, args.update);
      } else {
        found = applyDefaults(model, args.create);
        store[model].push(found);
      }
      persistStore();
      return shapeRow(store, model, found, args);
    },
    async delete(args: { where: Record<string, unknown> }) {
      const store = getStore();
      const idx = store[model].findIndex((r) =>
        matchesWhere(store, model, r, args.where),
      );
      if (idx < 0) throw new Error(`Record to delete not found in ${model}`);
      const [removed] = store[model].splice(idx, 1);
      persistStore();
      return removed;
    },
    async deleteMany(args?: { where?: Record<string, unknown> }) {
      const store = getStore();
      const before = store[model].length;
      store[model] = store[model].filter(
        (r) => !matchesWhere(store, model, r, args?.where),
      );
      persistStore();
      return { count: before - store[model].length };
    },
  };
}

export function ensureRuntimeUserProvisioned(userId: string, email: string): void {
  const store = getStore();
  const normalized = email.trim().toLowerCase();
  let user = store.user.find((u) => u.id === userId);
  if (!user) {
    user = applyDefaults("user", {
      id: userId,
      email: normalized,
      platformAdmin:
        normalized === "admin@eduon.kr" || normalized === "darkpon@naver.com",
      guardianVerifiedAt: new Date(),
    });
    store.user.push(user);
  }
  const uid = String(user.id);

  // Keep the primary live session open even on warm serverless instances
  const liveSession = store.session.find(
    (s) => s.id === SEED_SESSION_MATH_1_ID,
  );
  if (liveSession) {
    const nowMs = Date.now();
    const endsAtMs =
      liveSession.endsAt instanceof Date
        ? liveSession.endsAt.getTime()
        : new Date(String(liveSession.endsAt)).getTime();
    if (endsAtMs < nowMs + 30 * 60 * 1000) {
      liveSession.startsAt = new Date(nowMs - 5 * 60 * 1000);
      liveSession.endsAt = new Date(nowMs + 2 * 60 * 60 * 1000);
    }
  }

  for (const academy of store.academy) {
    const acadId = String(academy.id);
    if (
      !store.academyMembership.some(
        (m) => m.academyId === acadId && m.userId === uid,
      )
    ) {
      store.academyMembership.push(
        applyDefaults("academyMembership", {
          academyId: acadId,
          userId: uid,
          role: "owner",
          active: true,
        }),
      );
    }
  }

  // Prefer any real OAuth-connected ZoomAccount if one was connected
  const realConnectedZoom = store.zoomAccount.find(
    (z) =>
      z.status === "connected" &&
      typeof z.zoomUserId === "string" &&
      z.zoomUserId !== "zoom-host-5f0d97dc79",
  );
  const existingZoom = store.zoomAccount.find((z) => z.userId === uid);
  if (!existingZoom) {
    store.zoomAccount.push(
      applyDefaults("zoomAccount", {
        userId: uid,
        zoomUserId: realConnectedZoom
          ? String(realConnectedZoom.zoomUserId)
          : "zoom-host-5f0d97dc79",
        zoomEmail: realConnectedZoom
          ? String(realConnectedZoom.zoomEmail || normalized)
          : normalized,
        zoomDisplayName: realConnectedZoom
          ? String(realConnectedZoom.zoomDisplayName || `${normalized.split("@")[0]} 강사`)
          : `${normalized.split("@")[0]} 강사`,
        accountType: realConnectedZoom ? Number(realConnectedZoom.accountType || 2) : 2,
        cloudRecordingAllowed: realConnectedZoom
          ? Boolean(realConnectedZoom.cloudRecordingAllowed)
          : true,
        encryptedAccessToken: realConnectedZoom
          ? String(realConnectedZoom.encryptedAccessToken)
          : encryptZoomSecret("mock-access-seed-instructor-token"),
        encryptedRefreshToken: realConnectedZoom
          ? String(realConnectedZoom.encryptedRefreshToken)
          : encryptZoomSecret("mock-refresh-seed-instructor-token"),
        tokenExpiresAt: realConnectedZoom
          ? (realConnectedZoom.tokenExpiresAt as Date)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        scopes:
          "user:read:user meeting:write:meeting meeting:read:meeting cloud_recording:read:list_user_recordings",
        status: "connected",
      }),
    );
  } else if (
    realConnectedZoom &&
    existingZoom.zoomUserId === "zoom-host-5f0d97dc79"
  ) {
    existingZoom.zoomUserId = realConnectedZoom.zoomUserId;
    existingZoom.zoomEmail = realConnectedZoom.zoomEmail;
    existingZoom.zoomDisplayName = realConnectedZoom.zoomDisplayName;
    existingZoom.encryptedAccessToken = realConnectedZoom.encryptedAccessToken;
    existingZoom.encryptedRefreshToken = realConnectedZoom.encryptedRefreshToken;
    existingZoom.tokenExpiresAt = realConnectedZoom.tokenExpiresAt;
    existingZoom.status = "connected";
  }

  for (const off of store.offering) {
    const offId = String(off.id);
    if (
      !store.instructorAssignment.some(
        (a) => a.offeringId === offId && a.userId === uid,
      )
    ) {
      store.instructorAssignment.push(
        applyDefaults("instructorAssignment", {
          offeringId: offId,
          userId: uid,
        }),
      );
    }
  }

  let student = store.studentProfile.find((s) => s.accountUserId === uid);
  if (!student) {
    const existingSeedStudent = store.studentProfile.find(
      (s) => s.id === SEED_STUDENT_ID,
    );
    if (existingSeedStudent && uid === SEED_ADMIN_ID) {
      existingSeedStudent.accountUserId = uid;
      student = existingSeedStudent;
    } else {
      const newStudentId = randomUUID();
      student = applyDefaults("studentProfile", {
        id: newStudentId,
        name: `${normalized.split("@")[0]} 학생`,
        grade: 5,
        accountUserId: uid,
      });
      store.studentProfile.push(student);
      store.guardianLink.push(
        applyDefaults("guardianLink", {
          guardianId: uid,
          studentId: newStudentId,
          verifiedAt: new Date(),
        }),
      );
    }
  }

  const studentId = String(student.id);
  for (const off of store.offering) {
    const offId = String(off.id);
    if (
      !store.enrollment.some(
        (e) => e.offeringId === offId && e.studentId === studentId,
      )
    ) {
      store.enrollment.push(
        applyDefaults("enrollment", {
          offeringId: offId,
          studentId,
          status: "active",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }),
      );
    }
  }

  persistStore();
}

export function exportRuntimeSnapshot(): Record<string, unknown> {
  const store = getStore();
  return {
    updatedAt: new Date().toISOString(),
    zoomAccounts: store.zoomAccount
      .filter((z) => z.zoomUserId !== "zoom-host-5f0d97dc79")
      .slice(-10),
    courses: store.course.slice(-20),
    offerings: store.offering.slice(-20),
    sessions: store.session.slice(-40),
    instructorAssignments: store.instructorAssignment.slice(-40),
    zoomMeetings: store.zoomMeeting.slice(-40),
    enrollments: store.enrollment.slice(-40),
  };
}

export function hydrateRuntimeDbFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): void {
  if (!meta || typeof meta !== "object") return;
  const snap = meta.eduon_runtime_snapshot as
    | {
        zoomAccounts?: Row[];
        courses?: Row[];
        offerings?: Row[];
        sessions?: Row[];
        instructorAssignments?: Row[];
        zoomMeetings?: Row[];
        enrollments?: Row[];
      }
    | undefined;
  if (!snap || typeof snap !== "object") return;

  const store = getStore();
  const upsertById = (table: Row[], incoming: Row[] | undefined) => {
    if (!Array.isArray(incoming)) return;
    for (const raw of incoming) {
      if (!raw || typeof raw !== "object" || !raw.id) continue;
      const revived = reviveRow(raw);
      const idx = table.findIndex((r) => r.id === revived.id);
      if (idx === -1) {
        table.push(revived);
      } else {
        table[idx] = { ...table[idx], ...revived };
      }
    }
  };

  upsertById(store.course, snap.courses);
  upsertById(store.offering, snap.offerings);
  upsertById(store.session, snap.sessions);
  upsertById(store.instructorAssignment, snap.instructorAssignments);
  upsertById(store.enrollment, snap.enrollments);

  if (Array.isArray(snap.zoomAccounts)) {
    for (const raw of snap.zoomAccounts) {
      if (!raw || typeof raw !== "object") continue;
      const revived = reviveRow(raw);
      const idx = store.zoomAccount.findIndex(
        (z) => z.id === revived.id || z.userId === revived.userId,
      );
      if (idx === -1) {
        store.zoomAccount.push(revived);
      } else {
        store.zoomAccount[idx] = { ...store.zoomAccount[idx], ...revived };
      }
    }
  }

  if (Array.isArray(snap.zoomMeetings)) {
    for (const raw of snap.zoomMeetings) {
      if (!raw || typeof raw !== "object") continue;
      const revived = reviveRow(raw);
      const idx = store.zoomMeeting.findIndex(
        (m) => m.id === revived.id || m.sessionId === revived.sessionId,
      );
      if (idx === -1) {
        store.zoomMeeting.push(revived);
      } else {
        const current = store.zoomMeeting[idx];
        const currentIsDummy = current.zoomHostId === "zoom-host-5f0d97dc79";
        const incomingIsReal = revived.zoomHostId !== "zoom-host-5f0d97dc79";
        if (incomingIsReal || currentIsDummy) {
          store.zoomMeeting[idx] = { ...current, ...revived };
        }
      }
    }
  }

  persistStore();
}

export function createRuntimeDatabase() {
  if (!globalRuntimeDb.__eduonRuntimeClient) {
    const client: Record<string, unknown> = {
      user: createModelDelegate("user"),
      academy: createModelDelegate("academy"),
      academyMembership: createModelDelegate("academyMembership"),
      studentProfile: createModelDelegate("studentProfile"),
      guardianLink: createModelDelegate("guardianLink"),
      studentInvitation: createModelDelegate("studentInvitation"),
      instructorInvitation: createModelDelegate("instructorInvitation"),
      course: createModelDelegate("course"),
      offering: createModelDelegate("offering"),
      session: createModelDelegate("session"),
      instructorAssignment: createModelDelegate("instructorAssignment"),
      enrollment: createModelDelegate("enrollment"),
      auditEvent: createModelDelegate("auditEvent"),
      rateLimit: createModelDelegate("rateLimit"),
      recommendationEvent: createModelDelegate("recommendationEvent"),
      zoomAccount: createModelDelegate("zoomAccount"),
      zoomOAuthState: createModelDelegate("zoomOAuthState"),
      zoomMeeting: createModelDelegate("zoomMeeting"),
      zoomAttendanceSession: createModelDelegate("zoomAttendanceSession"),
      attendanceRecord: createModelDelegate("attendanceRecord"),
      zoomRecording: createModelDelegate("zoomRecording"),
      zoomWebhookEvent: createModelDelegate("zoomWebhookEvent"),
      sessionMaterial: createModelDelegate("sessionMaterial"),
      async $transaction<T>(
        fnOrArray: ((tx: unknown) => Promise<T>) | Promise<unknown>[],
      ): Promise<T> {
        if (Array.isArray(fnOrArray)) {
          return (await Promise.all(fnOrArray)) as unknown as T;
        }
        return fnOrArray(client);
      },
      async $executeRaw() {
        return 1;
      },
      async $queryRaw() {
        return [];
      },
      async $disconnect() {},
    };
    globalRuntimeDb.__eduonRuntimeClient = client;
  }
  return globalRuntimeDb.__eduonRuntimeClient;
}
