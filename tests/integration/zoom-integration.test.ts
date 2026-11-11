import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { setZoomProviderForTests } from "../../src/integrations/zoom/provider";
import { ZoomApiError, type ZoomPort } from "../../src/integrations/zoom/port";
import {
  completeZoomOAuthCallback,
  disconnectZoomAccount,
  ensureValidZoomAccessToken,
  getMyZoomAccount,
  initiateZoomOAuth,
  requestZoomReconnectionNotice,
} from "../../src/modules/zoom/account";
import {
  createOffering,
  publishOffering,
} from "../../src/modules/catalog/authoring";
import {
  cancelOfferingAndZoomMeetings,
  retryOfferingZoomSync,
  updateSessionScheduleAndSyncZoom,
} from "../../src/modules/zoom/meetings";
import {
  createSessionMaterial,
  getClassroomState,
  joinZoomSessionByStudent,
  startZoomSessionByHost,
} from "../../src/modules/zoom/classroom";
import {
  processZoomWebhookRequest,
  retryFailedZoomWebhookEvents,
} from "../../src/modules/zoom/webhook";
import { computeZoomWebhookSignature } from "../../src/integrations/zoom/crypto";
import { overrideStudentAttendance } from "../../src/modules/zoom/attendance";
import {
  requestZoomRecordingPlayback,
  resolveZoomRecordingStream,
  setZoomRecordingVisibility,
  syncSessionZoomRecordings,
} from "../../src/modules/zoom/recordings";
import { getAdminZoomDashboard } from "../../src/modules/zoom/admin";

let store: Awaited<ReturnType<typeof createTestDatabase>>;

function createMockZoomState() {
  let seq = 1000;
  let failCreateMeeting = false;
  let refreshCallCount = 0;
  const createdMeetings: Array<{
    meetingId: string;
    topic: string;
    startTimeIso: string;
    durationMinutes: number;
    hostId: string;
  }> = [];
  const updatedMeetings: Array<{
    meetingId: string;
    topic?: string;
    startTimeIso?: string;
    durationMinutes?: number;
  }> = [];
  const deletedMeetings: string[] = [];

  const provider: ZoomPort = {
    buildAuthorizeUrl(state: string) {
      return `https://zoom.us/oauth/authorize?client_id=test&state=${encodeURIComponent(state)}`;
    },
    async exchangeCodeForTokens(code: string) {
      return {
        accessToken: `access-${code}`,
        refreshToken: `refresh-${code}`,
        expiresInSeconds: 3600,
        scope:
          "user:read:user meeting:write:meeting cloud_recording:read:list_recording_files",
      };
    },
    async refreshTokens(refreshToken: string) {
      refreshCallCount += 1;
      await new Promise((r) => setTimeout(r, 25));
      if (refreshToken.includes("revoked")) {
        throw new ZoomApiError(401, "INVALID_GRANT", "Token revoked");
      }
      return {
        accessToken: `refreshed-access-${refreshCallCount}`,
        refreshToken: `refreshed-refresh-${refreshCallCount}`,
        expiresInSeconds: 3600,
        scope:
          "user:read:user meeting:write:meeting cloud_recording:read:list_recording_files",
      };
    },
    async revokeToken() {},
    async getCurrentUser(accessToken: string) {
      const suffix = accessToken.replace("access-", "");
      return {
        id: `zoom-host-${suffix}`,
        email: `${suffix}@zoom-instructor.test`,
        displayName: `${suffix} 강사`,
        type: suffix.includes("basic") ? 1 : 2,
        cloudRecordingAllowed: !suffix.includes("basic"),
      };
    },
    async getHostZakToken(accessToken: string) {
      return { zak: `zak-for-${accessToken}`, expiresIn: 7200 };
    },
    async createMeeting(accessToken, input) {
      if (failCreateMeeting) {
        throw new ZoomApiError(429, "RATE_LIMIT", "Zoom API rate limit", 1);
      }
      seq += 1;
      const meetingId = `990000${seq}`;
      const hostId = `zoom-host-${accessToken.replace("access-", "").replace(/refreshed-access-\d+/, "code-teacher-a")}`;
      createdMeetings.push({
        meetingId,
        topic: input.topic,
        startTimeIso: input.startTimeIso,
        durationMinutes: input.durationMinutes,
        hostId,
      });
      return {
        meetingId,
        meetingUuid: `uuid-${meetingId}`,
        hostId,
        joinUrl: `https://zoom.us/j/${meetingId}`,
        password: `pw${seq}`,
        waitingRoom: input.waitingRoom,
        autoRecording: input.autoRecording,
        status: "waiting",
      };
    },
    async updateMeeting(_accessToken, meetingId, input) {
      updatedMeetings.push({
        meetingId,
        topic: input.topic,
        startTimeIso: input.startTimeIso,
        durationMinutes: input.durationMinutes,
      });
    },
    async deleteMeeting(_accessToken, meetingId) {
      deletedMeetings.push(meetingId);
    },
    async getMeetingRecordings(_accessToken, meetingIdOrUuid) {
      return [
        {
          id: `remote-rec-${meetingIdOrUuid}`,
          meetingUuid: meetingIdOrUuid,
          fileType: "MP4",
          recordingType: "shared_screen_with_speaker_view",
          fileSize: 52428800,
          playUrl: `https://zoom.us/rec/play/${meetingIdOrUuid}`,
          downloadUrl: `https://zoom.us/rec/download/${meetingIdOrUuid}`,
          recordingStart: "2030-01-01T01:00:00Z",
          recordingEnd: "2030-01-01T02:00:00Z",
          status: "completed",
        },
      ];
    },
  };

  return {
    provider,
    setFailCreateMeeting(value: boolean) {
      failCreateMeeting = value;
    },
    getRefreshCallCount() {
      return refreshCallCount;
    },
    createdMeetings,
    updatedMeetings,
    deletedMeetings,
  };
}

beforeEach(async () => {
  store = await createTestDatabase();
});

afterEach(async () => {
  setZoomProviderForTests(null);
  delete process.env.ZOOM_EXTERNAL_SDK_APPROVED;
  delete process.env.ZOOM_SDK_KEY;
  delete process.env.ZOOM_SDK_SECRET;
  await store?.close();
});

async function connectInstructorZoom(
  db: typeof store.db,
  userId: string,
  code: string,
  now = new Date("2030-01-01T00:00:00Z"),
) {
  const ctx = { db, actor: { userId }, now: () => now };
  const init = await initiateZoomOAuth(ctx, { redirectPath: "/instructor" });
  expect(init.ok).toBe(true);
  if (!init.ok) throw new Error("OAuth init failed");
  const done = await completeZoomOAuthCallback(ctx, {
    code,
    state: init.value.state,
  });
  expect(done.ok).toBe(true);
  if (!done.ok) throw new Error("OAuth callback failed");
  return done.value.account;
}

describe("Zoom 통합 시나리오 검증", () => {
  it("1~4. 강사 A/B Zoom OAuth 연결 분리, 타 강사 state 탈취 차단, 만료 토큰 동시 갱신 잠금, 연결 해제 시 관리자 검토 전환", async () => {
    const mock = createMockZoomState();
    setZoomProviderForTests(mock.provider);
    const s = await seedScenario(store.db);
    const now = new Date("2030-01-01T00:00:00Z");

    // 강사 A OAuth 시작 후 강사 B가 강사 A의 state로 콜백 시도 -> FORBIDDEN
    const initA = await initiateZoomOAuth(
      { db: store.db, actor: { userId: s.teacher.userId }, now: () => now },
      { redirectPath: "/instructor" },
    );
    expect(initA.ok).toBe(true);
    if (!initA.ok) return;

    const hijackAttempt = await completeZoomOAuthCallback(
      { db: store.db, actor: { userId: s.otherTeacher.userId }, now: () => now },
      { code: "code-teacher-b", state: initA.value.state },
    );
    expect(hijackAttempt).toEqual({ ok: false, code: "FORBIDDEN" });

    // 강사 A, 강사 B 각각 정상 연결
    const accA = await connectInstructorZoom(
      store.db,
      s.teacher.userId,
      "code-teacher-a",
      now,
    );
    const accB = await connectInstructorZoom(
      store.db,
      s.otherTeacher.userId,
      "code-teacher-b",
      now,
    );
    expect(accA.zoomUserId).toBe("zoom-host-code-teacher-a");
    expect(accB.zoomUserId).toBe("zoom-host-code-teacher-b");

    // 강사 B가 강사 A의 동일 Zoom 계정으로 중복 연결 시도 -> CONFLICT
    const dupInit = await initiateZoomOAuth(
      { db: store.db, actor: { userId: s.otherTeacher.userId }, now: () => now },
      { redirectPath: "/instructor" },
    );
    if (!dupInit.ok) return;
    const dupCallback = await completeZoomOAuthCallback(
      { db: store.db, actor: { userId: s.otherTeacher.userId }, now: () => now },
      { code: "code-teacher-a", state: dupInit.value.state },
    );
    expect(dupCallback).toEqual({ ok: false, code: "CONFLICT" });

    // 만료 임박 토큰 동시 갱신 요청 시 1회만 갱신 호출되는지 확인
    const afterExpiry = new Date("2030-01-01T00:58:00Z");
    const [t1, t2, t3] = await Promise.all([
      ensureValidZoomAccessToken(store.db, s.teacher.userId, afterExpiry),
      ensureValidZoomAccessToken(store.db, s.teacher.userId, afterExpiry),
      ensureValidZoomAccessToken(store.db, s.teacher.userId, afterExpiry),
    ]);
    expect(t1).toBe("refreshed-access-1");
    expect(t2).toBe("refreshed-access-1");
    expect(t3).toBe("refreshed-access-1");
    expect(mock.getRefreshCallCount()).toBe(1);

    // 강사 A의 Zoom 라이브 강의 생성 후 계정 연결 해제 -> 회의가 needs_admin_review로 전환
    const offRes = await createOffering(
      { db: store.db, actor: { userId: s.owner.userId }, now: () => now },
      {
        academyId: s.academyId,
        title: "Zoom 실시간 수학 특강",
        subject: "math",
        gradeMin: 4,
        gradeMax: 6,
        level: "intermediate",
        priceWon: 120000,
        capacity: 10,
        enrollmentOpensAt: "2029-01-01T00:00:00Z",
        enrollmentClosesAt: "2029-12-31T00:00:00Z",
        instructorIds: [s.teacher.userId],
        isZoomLive: true,
        zoomWaitingRoom: true,
        zoomAutoRecording: "cloud",
        sessions: [
          {
            startsAt: "2030-02-01T01:00:00Z",
            endsAt: "2030-02-01T02:00:00Z",
          },
        ],
      },
    );
    expect(offRes.ok).toBe(true);
    if (!offRes.ok) return;

    const disc = await disconnectZoomAccount({
      db: store.db,
      actor: { userId: s.teacher.userId },
      now: () => now,
    });
    expect(disc.ok).toBe(true);
    if (!disc.ok) return;
    expect(disc.value.affectedMeetingsCount).toBe(1);

    const meetingAfterDisc = await store.db.zoomMeeting.findFirst({
      where: { offeringId: offRes.value.offeringId },
    });
    expect(meetingAfterDisc?.status).toBe("needs_admin_review");

    // 관리자가 강사 A에게 재연결 안내 발송
    const notice = await requestZoomReconnectionNotice(
      { db: store.db, actor: { userId: s.admin.userId }, now: () => now },
      {
        instructorId: s.teacher.userId,
        reason: "다음 주 실시간 수학 수업 전 Zoom 계정을 재연결해 주세요.",
      },
    );
    expect(notice.ok).toBe(true);

    const myStatus = await getMyZoomAccount({
      db: store.db,
      actor: { userId: s.teacher.userId },
      now: () => now,
    });
    expect(myStatus.ok).toBe(true);
    if (myStatus.ok) {
      expect(myStatus.value.reconnectionNotifiedAt).not.toBeNull();
    }
  });

  it("5~8. 강의 개설 시 Zoom 회의 자동 생성, API 장애 시 강의 데이터 보존 및 재시도, 중복 생성 방지, 일정 수정·강의 취소 동기화", async () => {
    const mock = createMockZoomState();
    setZoomProviderForTests(mock.provider);
    const s = await seedScenario(store.db);
    const now = new Date("2029-06-01T00:00:00Z");

    await connectInstructorZoom(
      store.db,
      s.teacher.userId,
      "code-teacher-a",
      now,
    );

    // 1) Zoom API 장애 상황에서 강의 개설 -> LMS 강의/회차 데이터는 유실 없이 저장되고 sync_failed 기록
    mock.setFailCreateMeeting(true);
    const failedSyncOffering = await createOffering(
      { db: store.db, actor: { userId: s.owner.userId }, now: () => now },
      {
        academyId: s.academyId,
        title: "Zoom API 장애 복원 테스트 강의",
        subject: "math",
        gradeMin: 4,
        gradeMax: 6,
        level: "beginner",
        priceWon: 150000,
        capacity: 15,
        enrollmentOpensAt: "2029-01-01T00:00:00Z",
        enrollmentClosesAt: "2029-12-31T00:00:00Z",
        instructorIds: [s.teacher.userId],
        isZoomLive: true,
        zoomWaitingRoom: true,
        zoomAutoRecording: "cloud",
        sessions: [
          {
            startsAt: "2030-03-01T01:00:00Z",
            endsAt: "2030-03-01T02:00:00Z",
          },
          {
            startsAt: "2030-03-08T01:00:00Z",
            endsAt: "2030-03-08T02:00:00Z",
          },
        ],
      },
    );
    expect(failedSyncOffering.ok).toBe(true);
    if (!failedSyncOffering.ok) return;

    const savedOffering = await store.db.offering.findUnique({
      where: { id: failedSyncOffering.value.offeringId },
      include: { sessions: { include: { zoomMeeting: true } } },
    });
    expect(savedOffering?.sessions).toHaveLength(2);
    expect(savedOffering?.sessions[0].zoomMeeting?.status).toBe("sync_failed");

    // 2) API 복구 후 수동 재시도(retryOfferingZoomSync) -> 2개 회차 모두 scheduled로 생성
    mock.setFailCreateMeeting(false);
    const retried = await retryOfferingZoomSync(
      { db: store.db, actor: { userId: s.teacher.userId }, now: () => now },
      failedSyncOffering.value.offeringId,
    );
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.value.createdCount).toBe(2);
    expect(mock.createdMeetings).toHaveLength(2);

    // 3) 강의 공개(publishOffering) 시 이미 생성된 회차는 중복 생성하지 않고 업데이트만 수행
    const pub = await publishOffering(
      { db: store.db, actor: { userId: s.owner.userId }, now: () => now },
      failedSyncOffering.value.offeringId,
    );
    expect(pub.ok).toBe(true);
    expect(mock.createdMeetings).toHaveLength(2); // 중복 생성 0건!

    // 4) 회차 일정 수정 시 Zoom 회의 일정 동기화
    const firstSessionId = savedOffering!.sessions[0].id;
    const updatedSchedule = await updateSessionScheduleAndSyncZoom(
      { db: store.db, actor: { userId: s.teacher.userId }, now: () => now },
      {
        sessionId: firstSessionId,
        startsAt: "2030-03-01T03:00:00Z",
        endsAt: "2030-03-01T04:30:00Z",
      },
    );
    expect(updatedSchedule.ok).toBe(true);
    expect(mock.updatedMeetings.some((m) => m.durationMinutes === 90)).toBe(
      true,
    );

    // 5) 강의 취소 시 Zoom 회의 취소 동기화
    const cancelled = await cancelOfferingAndZoomMeetings(
      { db: store.db, actor: { userId: s.owner.userId }, now: () => now },
      failedSyncOffering.value.offeringId,
      "강사 사정으로 인한 폐강",
    );
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) {
      expect(cancelled.value.cancelledMeetingsCount).toBe(2);
    }
    expect(mock.deletedMeetings).toHaveLength(2);
  });

  it("9~11. 학생 수강권·시간창·호스트 권한 분리(role=0) 및 2026 외부 회의 SDK 정책 검증", async () => {
    const mock = createMockZoomState();
    setZoomProviderForTests(mock.provider);
    const s = await seedScenario(store.db);
    const now = new Date("2029-06-01T00:00:00Z");

    await connectInstructorZoom(
      store.db,
      s.teacher.userId,
      "code-teacher-a",
      now,
    );

    // 학생 계정 바인딩 (student, otherStudent)
    await store.db.studentProfile.update({
      where: { id: s.studentId },
      data: { accountUserId: s.student.userId },
    });
    const unboundUser = await store.db.user.create({
      data: { email: "other-student@example.test" },
    });
    await store.db.studentProfile.update({
      where: { id: s.otherStudentId },
      data: { accountUserId: unboundUser.id },
    });

    // Zoom 라이브 강의 개설 및 공개
    const created = await createOffering(
      { db: store.db, actor: { userId: s.owner.userId }, now: () => now },
      {
        academyId: s.academyId,
        title: "Zoom 실시간 영어 독해",
        subject: "english",
        gradeMin: 4,
        gradeMax: 6,
        level: "beginner",
        priceWon: 100000,
        capacity: 10,
        enrollmentOpensAt: "2029-01-01T00:00:00Z",
        enrollmentClosesAt: "2029-12-31T00:00:00Z",
        instructorIds: [s.teacher.userId],
        isZoomLive: true,
        zoomWaitingRoom: true,
        zoomAutoRecording: "cloud",
        sessions: [
          {
            startsAt: "2030-01-01T01:00:00Z",
            endsAt: "2030-01-01T02:00:00Z",
          },
        ],
      },
    );
    if (!created.ok) throw new Error("Failed to create offering");
    await publishOffering(
      { db: store.db, actor: { userId: s.owner.userId }, now: () => now },
      created.value.offeringId,
    );

    const sessionRow = await store.db.session.findFirstOrThrow({
      where: { offeringId: created.value.offeringId },
    });

    // student만 수강 등록 (otherStudent는 미수강)
    await store.db.enrollment.create({
      data: {
        offeringId: created.value.offeringId,
        studentId: s.studentId,
        status: "active",
      },
    });

    const classJoinTime = new Date("2030-01-01T00:55:00Z"); // 시작 5분 전 (10분 전 시간창 내부)

    // 1) 미수강 학생 입장 차단
    const unenrolledJoin = await joinZoomSessionByStudent(
      {
        db: store.db,
        actor: { userId: unboundUser.id },
        now: () => classJoinTime,
      },
      sessionRow.id,
    );
    expect(unenrolledJoin).toEqual({ ok: false, code: "FORBIDDEN" });

    // 2) 수업 시작 30분 전(입장 가능 시간창 이전) 수강생 입장 차단
    const tooEarlyJoin = await joinZoomSessionByStudent(
      {
        db: store.db,
        actor: { userId: s.student.userId },
        now: () => new Date("2030-01-01T00:30:00Z"),
      },
      sessionRow.id,
    );
    expect(tooEarlyJoin).toEqual({ ok: false, code: "FORBIDDEN" });

    // 3) 외부 회의 SDK 미승인 기본 상태에서 수강생 입장 -> 안전한 외부 입장 URL 제공 (sdk: null)
    const externalJoin = await joinZoomSessionByStudent(
      {
        db: store.db,
        actor: { userId: s.student.userId },
        now: () => classJoinTime,
      },
      sessionRow.id,
    );
    expect(externalJoin.ok).toBe(true);
    if (externalJoin.ok) {
      expect(externalJoin.value.role).toBe("attendee");
      expect(externalJoin.value.joinMode).toBe("external_only");
      expect(externalJoin.value.sdk).toBeNull();
      expect(externalJoin.value.externalJoinUrl).toContain(
        `customer_key=${s.studentId}`,
      );
    }

    // 4) 외부 회의 SDK 승인 완료 시 수강생에게 role=0 SDK 서명 발급 (절대 호스트 권한 부여 안 함)
    process.env.ZOOM_SDK_KEY = "test-sdk-key";
    process.env.ZOOM_SDK_SECRET = "test-sdk-secret-at-least-32-characters";
    process.env.ZOOM_EXTERNAL_SDK_APPROVED = "true";

    const sdkJoin = await joinZoomSessionByStudent(
      {
        db: store.db,
        actor: { userId: s.student.userId },
        now: () => classJoinTime,
      },
      sessionRow.id,
    );
    expect(sdkJoin.ok).toBe(true);
    if (sdkJoin.ok) {
      expect(sdkJoin.value.role).toBe("attendee");
      expect(sdkJoin.value.joinMode).toBe("sdk_and_external");
      expect(sdkJoin.value.sdk?.role).toBe(0);
      expect(sdkJoin.value.sdk?.zak).toBeUndefined();
    }

    // 5) 다른 강사(otherTeacher)가 강사 A의 수업을 호스트로 시작 시도 -> FORBIDDEN
    const wrongHost = await startZoomSessionByHost(
      {
        db: store.db,
        actor: { userId: s.otherTeacher.userId },
        now: () => classJoinTime,
      },
      sessionRow.id,
    );
    expect(wrongHost).toEqual({ ok: false, code: "FORBIDDEN" });

    // 6) 담당 강사(teacher)가 호스트로 수업 시작 -> role=1 + ZAK 발급
    const hostStart = await startZoomSessionByHost(
      {
        db: store.db,
        actor: { userId: s.teacher.userId },
        now: () => classJoinTime,
      },
      sessionRow.id,
    );
    expect(hostStart.ok).toBe(true);
    if (hostStart.ok) {
      expect(hostStart.value.role).toBe("host");
      expect(hostStart.value.sdk?.role).toBe(1);
      expect(hostStart.value.sdk?.zak).toContain("zak-for-");
    }

    // 7) 강의자료 등록 및 강의실 상태 조회
    const mat = await createSessionMaterial(
      {
        db: store.db,
        actor: { userId: s.teacher.userId },
        now: () => classJoinTime,
      },
      {
        sessionId: sessionRow.id,
        title: "1회차 핵심 요약 노트",
        fileName: "week1-notes.txt",
        content: "이차방정식 근의 공식 유도 과정 정리",
      },
    );
    expect(mat.ok).toBe(true);

    const state = await getClassroomState(
      {
        db: store.db,
        actor: { userId: s.student.userId },
        now: () => classJoinTime,
      },
      created.value.offeringId,
    );
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.value.sessions[0].materials).toHaveLength(1);
      expect(state.value.sessions[0].materials[0].title).toBe(
        "1회차 핵심 요약 노트",
      );
    }
  });

  it("12~16. Webhook 기반 출석(입장·퇴장·재입장 병합·중복 방지·역순 수신·미종료 보정·동명이인 보류·수동 변경 보존)", async () => {
    const mock = createMockZoomState();
    setZoomProviderForTests(mock.provider);
    const s = await seedScenario(store.db, { capacity: 10 });
    const now = new Date("2030-01-01T00:00:00Z");

    await connectInstructorZoom(
      store.db,
      s.teacher.userId,
      "code-teacher-a",
      now,
    );

    const created = await createOffering(
      { db: store.db, actor: { userId: s.owner.userId }, now: () => now },
      {
        academyId: s.academyId,
        title: "Zoom 출석 자동화 검증 수학",
        subject: "math",
        gradeMin: 4,
        gradeMax: 6,
        level: "beginner",
        priceWon: 100000,
        capacity: 10,
        enrollmentOpensAt: "2029-01-01T00:00:00Z",
        enrollmentClosesAt: "2029-12-31T00:00:00Z",
        instructorIds: [s.teacher.userId],
        isZoomLive: true,
        sessions: [
          {
            startsAt: "2030-01-01T01:00:00Z",
            endsAt: "2030-01-01T02:00:00Z", // 60분(3600초) 수업
          },
        ],
      },
    );
    if (!created.ok) throw new Error("Offering creation failed");
    const offeringId = created.value.offeringId;
    const sessionRow = await store.db.session.findFirstOrThrow({
      where: { offeringId },
      include: { zoomMeeting: true },
    });
    const zoomMeetingId = sessionRow.zoomMeeting!.zoomMeetingId;

    // 학생 4유형 구성:
    // 1) student (정상 입장+퇴장+재입장)
    // 2) otherStudent (퇴장 이벤트가 입장보다 먼저 역순 도착)
    // 3) unfinishedStudent (입장만 하고 퇴장 이벤트 없이 수업 종료 시 자동 보정)
    // 4) 동명이인 2명 ("김동명" A, "김동명" B) -> 이름만 같고 키/이메일 없을 때 자동 출석 확정 금지(ambiguous)
    const unfinishedStudent = await store.db.studentProfile.create({
      data: { name: "미종료 학생", grade: 5 },
    });
    const homonym1 = await store.db.studentProfile.create({
      data: { name: "김동명", grade: 5 },
    });
    const homonym2 = await store.db.studentProfile.create({
      data: { name: "김동명", grade: 5 },
    });

    for (const stId of [
      s.studentId,
      s.otherStudentId,
      unfinishedStudent.id,
      homonym1.id,
      homonym2.id,
    ]) {
      await store.db.enrollment.create({
        data: {
          offeringId,
          studentId: stId,
          status: "active",
        },
      });
    }

    async function sendWebhook(
      eventId: string,
      event: string,
      objectPayload: Record<string, unknown>,
      webhookNow = new Date("2030-01-01T01:00:00Z"),
    ) {
      const rawBody = JSON.stringify({
        event,
        event_id: eventId,
        event_ts: webhookNow.getTime(),
        payload: { object: { id: zoomMeetingId, ...objectPayload } },
      });
      const ts = String(Math.floor(webhookNow.getTime() / 1000));
      const sig = computeZoomWebhookSignature(rawBody, ts);
      return processZoomWebhookRequest({
        db: store.db,
        rawBody,
        timestampHeader: ts,
        signatureHeader: sig,
        now: webhookNow,
      });
    }

    // 1) meeting.started
    const startRes = await sendWebhook("evt-start-1", "meeting.started", {
      start_time: "2030-01-01T01:00:00Z",
    });
    expect(startRes.status).toBe(200);

    // 2) student: 01:00 입장 ~ 01:30 퇴장 (30분), 01:25 재입장 ~ 01:55 퇴장 (겹치는 5분 제외 총 55분 = 3300초, 91.7% -> present)
    await sendWebhook("evt-s1-join1", "meeting.participant_joined", {
      participant: {
        customer_key: s.studentId,
        user_name: "가상 학생",
        join_time: "2030-01-01T01:00:00Z",
      },
    });
    // 동일 Webhook 중복 전송 -> duplicate: true 및 이중 계산 방지
    const dupRes = await sendWebhook(
      "evt-s1-join1",
      "meeting.participant_joined",
      {
        participant: {
          customer_key: s.studentId,
          user_name: "가상 학생",
          join_time: "2030-01-01T01:00:00Z",
        },
      },
    );
    expect(dupRes.kind === "event" && dupRes.body.duplicate).toBe(true);

    await sendWebhook("evt-s1-leave1", "meeting.participant_left", {
      participant: {
        customer_key: s.studentId,
        user_name: "가상 학생",
        leave_time: "2030-01-01T01:30:00Z",
      },
    });
    await sendWebhook("evt-s1-join2", "meeting.participant_joined", {
      participant: {
        customer_key: s.studentId,
        user_name: "가상 학생",
        join_time: "2030-01-01T01:25:00Z",
      },
    });
    await sendWebhook("evt-s1-leave2", "meeting.participant_left", {
      participant: {
        customer_key: s.studentId,
        user_name: "가상 학생",
        leave_time: "2030-01-01T01:55:00Z",
      },
    });

    const recS1 = await store.db.attendanceRecord.findUniqueOrThrow({
      where: {
        sessionId_studentId: {
          sessionId: sessionRow.id,
          studentId: s.studentId,
        },
      },
    });
    expect(recS1.totalSeconds).toBe(3300);
    expect(recS1.attendanceRate).toBe(91.7);
    expect(recS1.status).toBe("present");

    // 3) otherStudent: 퇴장(01:40) 이벤트가 입장(01:05)보다 먼저 역순 수신 (35분 = 2100초, 58.3% -> late)
    await sendWebhook("evt-s2-leave-first", "meeting.participant_left", {
      participant: {
        customer_key: s.otherStudentId,
        user_name: "다른 가상 학생",
        leave_time: "2030-01-01T01:40:00Z",
      },
    });
    await sendWebhook("evt-s2-join-second", "meeting.participant_joined", {
      participant: {
        customer_key: s.otherStudentId,
        user_name: "다른 가상 학생",
        join_time: "2030-01-01T01:05:00Z",
      },
    });

    const recS2 = await store.db.attendanceRecord.findUniqueOrThrow({
      where: {
        sessionId_studentId: {
          sessionId: sessionRow.id,
          studentId: s.otherStudentId,
        },
      },
    });
    expect(recS2.totalSeconds).toBe(2100);
    expect(recS2.status).toBe("late");

    // 4) 동명이인("김동명")이 customer_key/이메일 없이 이름만으로 입장 -> ambiguous 매핑으로 자동 출석 확정 금지
    const homonymRes = await sendWebhook(
      "evt-homonym-join",
      "meeting.participant_joined",
      {
        participant: {
          id: "anon-zoom-participant-99",
          user_name: "김동명",
          join_time: "2030-01-01T01:00:00Z",
        },
      },
    );
    expect(homonymRes.kind === "event" && homonymRes.body.detail).toBe(
      "participant_joined:ambiguous",
    );

    // 5) unfinishedStudent: 01:10 입장 후 퇴장 이벤트 누락 상태에서 02:00에 meeting.ended 수신 -> 50분(3000초, 83.3% -> present) 자동 보정
    await sendWebhook("evt-s3-join", "meeting.participant_joined", {
      participant: {
        customer_key: unfinishedStudent.id,
        user_name: "미종료 학생",
        join_time: "2030-01-01T01:10:00Z",
      },
    });

    // 강사가 otherStudent의 출석을 사전에 수동 인정(present)으로 변경했을 때 meeting.ended가 덮어쓰지 않고 보존하는지 확인
    const manualRes = await overrideStudentAttendance(
      { db: store.db, actor: { userId: s.teacher.userId }, now: () => now },
      {
        sessionId: sessionRow.id,
        studentId: s.otherStudentId,
        status: "present",
        reason: "네트워크 끊김 사전 확인으로 출석 인정",
      },
    );
    expect(manualRes.ok).toBe(true);

    await sendWebhook(
      "evt-end-1",
      "meeting.ended",
      { end_time: "2030-01-01T02:00:00Z" },
      new Date("2030-01-01T02:00:00Z"),
    );

    const recS3 = await store.db.attendanceRecord.findUniqueOrThrow({
      where: {
        sessionId_studentId: {
          sessionId: sessionRow.id,
          studentId: unfinishedStudent.id,
        },
      },
    });
    expect(recS3.totalSeconds).toBe(3000);
    expect(recS3.status).toBe("present");

    const recS2AfterEnd = await store.db.attendanceRecord.findUniqueOrThrow({
      where: {
        sessionId_studentId: {
          sessionId: sessionRow.id,
          studentId: s.otherStudentId,
        },
      },
    });
    expect(recS2AfterEnd.status).toBe("present"); // 수동 인정 상태 보존
    expect(recS2AfterEnd.source).toBe("manual_override");

    // 동명이인 학생들은 미참석 처리(absent)로 남아 자동 출석 오확정이 발생하지 않음
    const recHomonym1 = await store.db.attendanceRecord.findUniqueOrThrow({
      where: {
        sessionId_studentId: {
          sessionId: sessionRow.id,
          studentId: homonym1.id,
        },
      },
    });
    expect(recHomonym1.status).toBe("absent");
  });

  it("17~19. 녹화 완료 Webhook 수신, 기본 비공개 보호, 강사 공개 승인, 수강권 없는 학생 및 만료 수강생 접근 차단, 실패 Webhook 재처리", async () => {
    const mock = createMockZoomState();
    setZoomProviderForTests(mock.provider);
    const s = await seedScenario(store.db);
    const now = new Date("2030-01-01T00:00:00Z");

    await connectInstructorZoom(
      store.db,
      s.teacher.userId,
      "code-teacher-a",
      now,
    );
    await store.db.studentProfile.update({
      where: { id: s.studentId },
      data: { accountUserId: s.student.userId },
    });

    const created = await createOffering(
      { db: store.db, actor: { userId: s.owner.userId }, now: () => now },
      {
        academyId: s.academyId,
        title: "Zoom 녹화 다시보기 보안 검증 강의",
        subject: "math",
        gradeMin: 4,
        gradeMax: 6,
        level: "beginner",
        priceWon: 100000,
        capacity: 10,
        enrollmentOpensAt: "2029-01-01T00:00:00Z",
        enrollmentClosesAt: "2029-12-31T00:00:00Z",
        instructorIds: [s.teacher.userId],
        isZoomLive: true,
        zoomAutoRecording: "cloud",
        sessions: [
          {
            startsAt: "2030-01-01T01:00:00Z",
            endsAt: "2030-01-01T02:00:00Z",
          },
        ],
      },
    );
    if (!created.ok) throw new Error("Offering creation failed");

    const sessionRow = await store.db.session.findFirstOrThrow({
      where: { offeringId: created.value.offeringId },
      include: { zoomMeeting: true },
    });

    const enrollment = await store.db.enrollment.create({
      data: {
        offeringId: created.value.offeringId,
        studentId: s.studentId,
        status: "active",
      },
    });

    // 1) recording.completed Webhook 수신 -> 기본 비공개(isPublic: false) 및 원본 URL 암호화 저장
    const rawBody = JSON.stringify({
      event: "recording.completed",
      event_id: "evt-rec-completed-1",
      event_ts: now.getTime(),
      payload: {
        object: {
          id: sessionRow.zoomMeeting!.zoomMeetingId,
          recording_files: [
            {
              id: "zoom-file-001",
              file_type: "MP4",
              file_size: 104857600,
              play_url: "https://zoom.us/rec/play/private-raw-url",
              download_url: "https://zoom.us/rec/download/private-raw-url",
              recording_start: "2030-01-01T01:00:00Z",
              recording_end: "2030-01-01T02:00:00Z",
              status: "completed",
            },
          ],
        },
      },
    });
    const ts = String(Math.floor(now.getTime() / 1000));
    const sig = computeZoomWebhookSignature(rawBody, ts);
    const whRes = await processZoomWebhookRequest({
      db: store.db,
      rawBody,
      timestampHeader: ts,
      signatureHeader: sig,
      now,
    });
    expect(whRes.status).toBe(200);

    const recRow = await store.db.zoomRecording.findFirstOrThrow({
      where: { sessionId: sessionRow.id },
    });
    expect(recRow.isPublic).toBe(false);
    expect(recRow.encryptedPlayUrl).not.toContain("https://zoom.us");

    // 2) 강사 공개 승인 전에는 수강생이라도 다시보기 요청 차단 (FORBIDDEN)
    const beforeApproval = await requestZoomRecordingPlayback(
      { db: store.db, actor: { userId: s.student.userId }, now: () => now },
      recRow.id,
    );
    expect(beforeApproval).toEqual({ ok: false, code: "FORBIDDEN" });

    // 3) 강사가 녹화 공개 승인
    const pubRec = await setZoomRecordingVisibility(
      { db: store.db, actor: { userId: s.teacher.userId }, now: () => now },
      {
        recordingId: recRow.id,
        isPublic: true,
        consentNoticeConfirmed: true,
      },
    );
    expect(pubRec.ok).toBe(true);

    // 4) 공개 후 수강생 다시보기 요청 -> 원본 Zoom URL 노출 없이 서명된 내부 스트림 경로 반환
    const playback = await requestZoomRecordingPlayback(
      { db: store.db, actor: { userId: s.student.userId }, now: () => now },
      recRow.id,
    );
    expect(playback.ok).toBe(true);
    if (playback.ok) {
      expect(playback.value.streamUrl).toContain(
        `/api/zoom/recordings/${recRow.id}/stream?token=`,
      );
      expect(playback.value.streamUrl).not.toContain("private-raw-url");

      const tokenParam = new URL(
        playback.value.streamUrl,
        "http://localhost",
      ).searchParams.get("token")!;
      const streamResolved = await resolveZoomRecordingStream(
        { db: store.db, actor: { userId: s.student.userId }, now: () => now },
        recRow.id,
        tokenParam,
      );
      expect(streamResolved.ok).toBe(true);
    }

    // 5) 수강권 만료(expiresAt 경과) 시 다시보기 차단 (EXPIRED)
    await store.db.enrollment.update({
      where: { id: enrollment.id },
      data: { expiresAt: new Date("2029-12-31T23:59:59Z") },
    });
    const expiredPlayback = await requestZoomRecordingPlayback(
      { db: store.db, actor: { userId: s.student.userId }, now: () => now },
      recRow.id,
    );
    expect(expiredPlayback).toEqual({ ok: false, code: "EXPIRED" });

    // 6) 강사 수동 클라우드 녹화 동기화 및 관리자 대시보드/실패 Webhook 재처리 검증
    const syncedRecs = await syncSessionZoomRecordings(
      { db: store.db, actor: { userId: s.teacher.userId }, now: () => now },
      sessionRow.id,
    );
    expect(syncedRecs.ok).toBe(true);

    await store.db.zoomWebhookEvent.create({
      data: {
        eventId: "evt-failed-test",
        eventType: "meeting.started",
        eventTs: BigInt(now.getTime()),
        payload: JSON.stringify({
          event: "meeting.started",
          payload: { object: { id: sessionRow.zoomMeeting!.zoomMeetingId } },
        }),
        status: "failed",
        errorMessage: "temporary db timeout",
      },
    });

    const retryWh = await retryFailedZoomWebhookEvents({
      db: store.db,
      actor: { userId: s.admin.userId },
      now: () => now,
    });
    expect(retryWh.ok).toBe(true);
    if (retryWh.ok) {
      expect(retryWh.value.succeededCount).toBe(1);
    }

    const overview = await getAdminZoomDashboard({
      db: store.db,
      actor: { userId: s.admin.userId },
      now: () => now,
    });
    expect(overview.ok).toBe(true);
    if (overview.ok) {
      expect(overview.value.instructorAccounts.length).toBeGreaterThanOrEqual(
        1,
      );
      expect(overview.value.meetings.length).toBeGreaterThanOrEqual(1);
    }
  });
});
