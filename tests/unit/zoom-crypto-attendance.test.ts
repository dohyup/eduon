import { describe, expect, it } from "vitest";
import {
  computeZoomWebhookSignature,
  createRecordingStreamToken,
  createZoomSdkSignature,
  createZoomUrlValidationResponse,
  decryptZoomSecret,
  decryptZoomSecretSafe,
  encryptZoomSecret,
  maskEmail,
  maskSensitivePayload,
  verifyRecordingStreamToken,
  verifyStatelessOAuthState,
  verifyZoomWebhookSignature,
} from "../../src/integrations/zoom/crypto";
import { updateRuntimeSettings } from "../../src/server/runtime-settings";
import {
  createRuntimeDatabase,
  ensureRuntimeUserProvisioned,
  exportRuntimeSnapshot,
  hydrateRuntimeDbFromMetadata,
} from "../../src/server/runtime-db";
import {
  computeAttendanceStatusFromRate,
  mergeTimeIntervals,
} from "../../src/modules/zoom/attendance";

describe("Zoom 암호화 및 보안 유틸리티", () => {
  it("AES-256-GCM으로 토큰과 비밀값을 암호화/복호화하고 변조를 감지한다", () => {
    const raw = "zoom-refresh-token-secret-value-12345";
    const encrypted1 = encryptZoomSecret(raw);
    const encrypted2 = encryptZoomSecret(raw);

    expect(encrypted1).not.toBe(raw);
    expect(encrypted1).not.toBe(encrypted2); // 매번 랜덤 IV 사용
    expect(decryptZoomSecret(encrypted1)).toBe(raw);
    expect(decryptZoomSecret(encrypted2)).toBe(raw);

    const parts = encrypted1.split(":");
    parts[3] = parts[3].slice(0, -2) + "AA";
    expect(() => decryptZoomSecret(parts.join(":"))).toThrow();
  });

  it("민감한 토큰·암호·URL 필드를 로그 저장 전에 마스킹한다", () => {
    const rawPayload = {
      event: "recording.completed",
      access_token: "secret-access-token",
      payload: {
        object: {
          id: "987654321",
          password: "secret-meeting-pass",
          recording_files: [
            {
              id: "rec-1",
              play_url: "https://zoom.us/rec/play/secret",
              download_url: "https://zoom.us/rec/download/secret",
            },
          ],
        },
      },
    };
    const masked = JSON.parse(maskSensitivePayload(rawPayload));
    expect(masked.access_token).toBe("[REDACTED]");
    expect(masked.payload.object.password).toBe("[REDACTED]");
    expect(masked.payload.object.recording_files[0].play_url).toBe("[REDACTED]");
    expect(masked.payload.object.recording_files[0].download_url).toBe(
      "[REDACTED]",
    );
    expect(masked.payload.object.id).toBe("987654321");
    expect(maskEmail("teacher1@eduon.kr")).toBe("te****@eduon.kr");
  });

  it("Zoom Webhook HMAC-SHA256 서명, 타임스탬프 만료, URL Validation 응답을 검증한다", () => {
    const secret = "webhook-secret-test-key";
    const now = new Date("2030-05-01T10:00:00Z");
    const ts = String(Math.floor(now.getTime() / 1000));
    const body = JSON.stringify({
      event: "meeting.started",
      payload: { object: { id: "12345" } },
    });

    const sig = computeZoomWebhookSignature(body, ts, secret);
    expect(
      verifyZoomWebhookSignature({
        rawBody: body,
        timestamp: ts,
        signature: sig,
        secret,
        now,
      }),
    ).toBe(true);

    // 변조된 본문 거부
    expect(
      verifyZoomWebhookSignature({
        rawBody: body + " ",
        timestamp: ts,
        signature: sig,
        secret,
        now,
      }),
    ).toBe(false);

    // 5분 초과 리플레이 타임스탬프 거부
    const expiredTs = String(Math.floor(now.getTime() / 1000) - 600);
    const expiredSig = computeZoomWebhookSignature(body, expiredTs, secret);
    expect(
      verifyZoomWebhookSignature({
        rawBody: body,
        timestamp: expiredTs,
        signature: expiredSig,
        secret,
        now,
      }),
    ).toBe(false);

    // URL Validation 챌린지 응답 생성
    const challenge = createZoomUrlValidationResponse("plain-token-xyz", secret);
    expect(challenge.plainToken).toBe("plain-token-xyz");
    expect(challenge.encryptedToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("Meeting SDK JWT 서명 생성 시 role(0=학생, 1=호스트)과 회의 번호를 정확히 인코딩한다", () => {
    const jwt = createZoomSdkSignature({
      sdkKey: "sdk-key-1",
      sdkSecret: "sdk-secret-1",
      meetingNumber: "912-345-6789",
      role: 0,
      now: new Date("2030-05-01T10:00:00Z"),
    });
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    expect(payload.mn).toBe("9123456789");
    expect(payload.role).toBe(0);
    expect(payload.sdkKey).toBe("sdk-key-1");
  });

  it("녹화 스트리밍 서명 토큰은 만료 시간과 수신자 ID를 검증한다", () => {
    const now = new Date("2030-05-01T10:00:00Z");
    const expiresAt = new Date("2030-05-01T10:05:00Z");
    const token = createRecordingStreamToken({
      recordingId: "rec-123",
      actorUserId: "user-456",
      expiresAt,
    });

    expect(verifyRecordingStreamToken(token, now)).toEqual({
      recordingId: "rec-123",
      actorUserId: "user-456",
    });

    // 만료 후 거부
    expect(
      verifyRecordingStreamToken(token, new Date("2030-05-01T10:06:00Z")),
    ).toBeNull();
  });

  it("관리자 설정에서 zoomClientSecret 변경 후에도 기존 암호화된 토큰을 정상 복호화하고 사용자 프로비저닝을 보장한다", async () => {
    const beforeSecret = encryptZoomSecret("seed-password-123456");
    updateRuntimeSettings({
      zoomClientId: "live-client-id",
      zoomClientSecret: "live-client-secret-updated-value",
    });
    expect(decryptZoomSecret(beforeSecret)).toBe("seed-password-123456");
    expect(decryptZoomSecretSafe("invalid-payload", "fallback-pw")).toBe(
      "fallback-pw",
    );

    const dynamicSupabaseId = "a1b2c3d4-e5f6-4789-8012-3456789abcde";
    ensureRuntimeUserProvisioned(dynamicSupabaseId, "admin@eduon.kr");
    const db = createRuntimeDatabase() as {
      zoomAccount: {
        findUnique: (args: { where: { userId: string } }) => Promise<{
          status: string;
        } | null>;
      };
      studentProfile: {
        findUnique: (args: { where: { accountUserId: string } }) => Promise<{
          id: string;
        } | null>;
      };
    };
    const zoomAcc = await db.zoomAccount.findUnique({
      where: { userId: dynamicSupabaseId },
    });
    const student = await db.studentProfile.findUnique({
      where: { accountUserId: dynamicSupabaseId },
    });
    expect(zoomAcc?.status).toBe("connected");
    expect(student?.id).toBeTruthy();

    // 스냅샷 직렬화 및 서버리스 인스턴스 간 메타데이터 복원 검증
    const snapshot = exportRuntimeSnapshot();
    expect(snapshot).toHaveProperty("offerings");
    hydrateRuntimeDbFromMetadata({ eduon_runtime_snapshot: snapshot });
    expect(
      verifyStatelessOAuthState("invalid.state", new Date()),
    ).toBeNull();
  });
});

describe("출석 구간 병합 및 출석률 판정 로직", () => {
  it("중복되거나 겹치는 재입장 시간 구간을 이중 계산 없이 정확히 병합한다", () => {
    const merged = mergeTimeIntervals([
      { startMs: 1000, endMs: 5000 },
      { startMs: 3000, endMs: 8000 }, // 겹침 -> 1000..8000 (7초)
      { startMs: 2000, endMs: 4000 }, // 완전 포함 -> 무시
      { startMs: 10000, endMs: 15000 }, // 분리 구간 -> 10000..15000 (5초)
    ]);
    expect(merged).toEqual([
      { startMs: 1000, endMs: 8000 },
      { startMs: 10000, endMs: 15000 },
    ]);
  });

  it("수업 참여율 및 지각 시간에 따라 출석(present)·지각(late)·결석(absent)을 판정한다", () => {
    expect(computeAttendanceStatusFromRate(90, 60)).toBe("present");
    expect(computeAttendanceStatusFromRate(82, 20 * 60)).toBe("late"); // 15분 초과 지각 입장 & 85% 미만
    expect(computeAttendanceStatusFromRate(65, 0)).toBe("late");
    expect(computeAttendanceStatusFromRate(40, 0)).toBe("absent");
  });
});

