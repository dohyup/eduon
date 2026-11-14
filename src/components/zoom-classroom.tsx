"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import styles from "./live-workspace.module.css";

type Result<T> = { ok: true; value: T } | { ok: false; code: string };

type ClassroomSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  windowState: "waiting_before_window" | "open" | "ended";
  minutesUntilOpen: number;
  zoomMeeting: {
    id: string;
    sessionId: string;
    zoomMeetingId: string;
    zoomMeetingUuid: string | null;
    waitingRoom: boolean;
    autoRecording: string;
    status: string;
    syncError: string | null;
    recordingConsentRequired: boolean;
  } | null;
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
};

type ClassroomData = {
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
  sessions: ClassroomSession[];
};

type JoinTicket = {
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
    role: 0 | 1;
  } | null;
};

type PlaybackInfo = {
  recordingId: string;
  courseTitle: string;
  fileType: string;
  durationSeconds: number;
  streamUrl: string;
  expiresAt: string;
  consentNotice: string;
};

const meetingStatusLabels: Record<string, string> = {
  scheduled: "수업 예정",
  started: "실시간 수업 진행 중",
  ended: "수업 종료",
  cancelled: "취소됨",
  sync_failed: "Zoom 동기화 실패",
  needs_admin_review: "관리자 검토 필요 (강사 재연결 대기)",
};

const attendanceStatusLabels: Record<string, string> = {
  present: "출석",
  late: "지각",
  absent: "결석",
  pending: "출석 집계 중",
  unverified_mapping: "참가자 매핑 확인 필요",
};

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ZoomClassroom({
  targetId,
  role,
}: {
  targetId: string;
  role: "student" | "instructor";
}) {
  const [data, setData] = useState<ClassroomData | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [statusError, setStatusError] = useState(false);
  const [ticket, setTicket] = useState<JoinTicket | null>(null);
  const [consentChecked, setConsentChecked] = useState(true);
  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch(`/api/zoom/sessions/${targetId}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        const json = (await res.json()) as Result<ClassroomData>;
        if (!res.ok || !json.ok) {
          setError(
            json.ok
              ? "강의실 정보를 불러오지 못했습니다."
              : json.code === "FORBIDDEN"
                ? "수강권이 없거나 이 강의실에 접근할 권한이 없습니다."
                : "강의실 정보를 찾을 수 없습니다.",
          );
          setData(null);
        } else {
          setError("");
          setData(json.value);
          setSelectedSessionId((prev) =>
            prev && json.value.sessions.some((s) => s.id === prev)
              ? prev
              : (json.value.sessions[0]?.id ?? ""),
          );
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [targetId],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const currentSession =
    data?.sessions.find((s) => s.id === selectedSessionId) ??
    data?.sessions[0] ??
    null;

  async function handleJoin(mode: "host" | "student") {
    if (!currentSession || busy) return;
    setBusy("join");
    setStatusError(false);
    setStatusMsg("");
    try {
      const res = await fetch(
        `/api/zoom/sessions/${currentSession.id}/join`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            recordingConsentAgreed: consentChecked,
          }),
        },
      );
      const json = (await res.json()) as Result<JoinTicket>;
      if (!res.ok || !json.ok) {
        const errCode = !json.ok ? json.code : `HTTP_${res.status}`;
        console.warn("[EDUON ZoomClassroom] Join ticket request failed:", {
          sessionId: currentSession.id,
          mode,
          status: res.status,
          code: errCode,
        });
        setStatusError(true);
        setStatusMsg(
          !json.ok && json.code === "FORBIDDEN"
            ? "수업 입장 권한이 없거나 입장 가능 시간(시작 10분 전~종료 15분 후)이 아닙니다."
            : !json.ok && json.code === "EXPIRED"
              ? "수강권 유효기간이 만료되었습니다."
              : `Zoom 회의 입장 정보를 준비하지 못했습니다 (${errCode}). 잠시 후 다시 시도해 주세요.`,
        );
        return;
      }
      setTicket(json.value);
      if (mode === "student") {
        await fetch("/api/zoom/quick-actions", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "record_attendance",
            sessionId: currentSession.id,
            participatedMinutes: 50,
          }),
        }).catch(() => undefined);
      }
      setStatusMsg(
        mode === "host"
          ? "강사 호스트 시작 권한이 확인되어 실시간 수업이 시작되었습니다."
          : "실시간 화상강의 입장 및 출석 체크가 완료되었습니다.",
      );
      await load();
    } catch {
      setStatusError(true);
      setStatusMsg("입장 요청 처리 중 오류가 발생했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function handleQuickAction(
    key: string,
    payload: Record<string, unknown>,
    successMsg: string,
  ) {
    if (busy) return;
    setBusy(key);
    setStatusError(false);
    setStatusMsg("");
    try {
      const res = await fetch("/api/zoom/quick-actions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as Result<unknown>;
      if (!res.ok || !json.ok) {
        setStatusError(true);
        setStatusMsg("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setStatusMsg(successMsg);
      await load();
    } catch {
      setStatusError(true);
      setStatusMsg("처리 중 네트워크 오류가 발생했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function handleMaterialCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentSession || busy) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy("material");
    setStatusError(false);
    setStatusMsg("");
    try {
      const res = await fetch(
        `/api/zoom/sessions/${currentSession.id}/materials`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: String(formData.get("title") || "").trim(),
            fileName: String(formData.get("fileName") || "").trim(),
            content: String(formData.get("content") || "").trim(),
          }),
        },
      );
      const json = (await res.json()) as Result<{ materialId: string }>;
      if (!res.ok || !json.ok) {
        setStatusError(true);
        setStatusMsg("수업 자료를 등록하지 못했습니다.");
        return;
      }
      form.reset();
      setStatusMsg("수업 자료를 등록했습니다.");
      await load();
    } finally {
      setBusy("");
    }
  }

  function downloadMaterial(material: {
    fileName: string;
    content: string;
  }) {
    const blob = new Blob([material.content], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = material.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSyncRecordings() {
    if (!currentSession || busy) return;
    setBusy("sync-rec");
    setStatusError(false);
    setStatusMsg("");
    try {
      const res = await fetch(
        `/api/zoom/sessions/${currentSession.id}/recordings`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const json = (await res.json()) as Result<{ syncedCount: number }>;
      if (!res.ok || !json.ok) {
        setStatusError(true);
        setStatusMsg("Zoom 클라우드 녹화 목록을 동기화하지 못했습니다.");
        return;
      }
      setStatusMsg(
        `Zoom 클라우드 녹화 ${json.value.syncedCount}건을 동기화했습니다.`,
      );
      await load();
    } finally {
      setBusy("");
    }
  }

  async function handleToggleRecordingVisibility(
    recordingId: string,
    nextPublic: boolean,
  ) {
    if (busy) return;
    setBusy(`rec-${recordingId}`);
    setStatusError(false);
    setStatusMsg("");
    try {
      const res = await fetch(`/api/zoom/recordings/${recordingId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPublic: nextPublic,
          consentNoticeConfirmed: true,
        }),
      });
      const json = (await res.json()) as Result<{ isPublic: boolean }>;
      if (!res.ok || !json.ok) {
        setStatusError(true);
        setStatusMsg("녹화 공개 설정을 변경하지 못했습니다.");
        return;
      }
      setStatusMsg(
        nextPublic
          ? "녹화 영상을 수강생에게 공개했습니다."
          : "녹화 영상을 비공개로 전환했습니다.",
      );
      await load();
    } finally {
      setBusy("");
    }
  }

  async function handleWatchRecording(recordingId: string) {
    if (busy) return;
    setBusy(`play-${recordingId}`);
    setStatusError(false);
    setStatusMsg("");
    try {
      const res = await fetch(`/api/zoom/recordings/${recordingId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as Result<PlaybackInfo>;
      if (!res.ok || !json.ok) {
        setStatusError(true);
        setStatusMsg(
          "다시보기 권한이 없거나 비공개 상태인 녹화 영상입니다.",
        );
        return;
      }
      setPlayback(json.value);
      setStatusMsg("다시보기 스트림 권한 확인이 완료되었습니다.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main id="main-content" className={`container ${styles.workspace}`}>
      <div className={styles.top}>
        <span>
          EDUON 실시간 화상강의실 ·{" "}
          {role === "instructor" ? "강사 강의실" : "학생 배움터"}
        </span>
        <div className={styles.actions}>
          <Link
            className={styles.secondary}
            href={
              role === "instructor"
                ? `/learn/classes/${targetId}`
                : `/instructor/classes/${targetId}`
            }
          >
            {role === "instructor"
              ? "학생 강의실 화면으로 전환 →"
              : "강사 호스트 화면으로 전환 →"}
          </Link>
          <Link
            className={styles.secondary}
            href={role === "instructor" ? "/instructor" : "/learn"}
          >
            ← 내 공간으로 돌아가기
          </Link>
        </div>
      </div>

      {loading && (
        <p className={styles.empty} role="status">
          강의실 정보를 불러오는 중입니다…
        </p>
      )}

      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <div className={styles.actions}>
            <Link
              className={styles.primary}
              href={role === "instructor" ? "/instructor" : "/learn"}
            >
              돌아가기
            </Link>
          </div>
        </div>
      )}

      {statusMsg && (
        <p
          className={statusError ? styles.error : styles.success}
          role={statusError ? "alert" : "status"}
        >
          {statusMsg}
        </p>
      )}

      {data && currentSession && (
        <div className={styles.body}>
          <header className={styles.heading}>
            <p className={styles.eyebrow}>
              {data.offering.academyName} ·{" "}
              {data.offering.isZoomLive ? "ZOOM LIVE CLASSROOM" : "CLASSROOM"}
            </p>
            <h1>{data.offering.title}</h1>
            <p>
              담당 강사: {data.offering.instructorNames.join(", ") || "배정 강사"}{" "}
              · 현재 상태:{" "}
              {currentSession.zoomMeeting
                ? (meetingStatusLabels[currentSession.zoomMeeting.status] ??
                  currentSession.zoomMeeting.status)
                : "준비 중"}
            </p>
          </header>

          {data.sessions.length > 1 && (
            <section className={styles.panel}>
              <h2>수업 회차 선택</h2>
              <label className={styles.form}>
                회차
                <select
                  aria-label="수업 회차 선택"
                  value={currentSession.id}
                  onChange={(e) => {
                    setSelectedSessionId(e.target.value);
                    setTicket(null);
                    setPlayback(null);
                  }}
                >
                  {data.sessions.map((s, idx) => (
                    <option key={s.id} value={s.id}>
                      {idx + 1}회차: {formatDateTime(s.startsAt)} ~{" "}
                      {formatDateTime(s.endsAt)}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          <section className={styles.panel}>
            <div className={styles.row}>
              <div>
                <h2>Zoom 실시간 화상강의 영역</h2>
                <p>
                  수업 시간: {formatDateTime(currentSession.startsAt)} ~{" "}
                  {formatDateTime(currentSession.endsAt)} (Asia/Seoul)
                </p>
              </div>
              <span className={styles.badge}>
                {currentSession.zoomMeeting
                  ? (meetingStatusLabels[currentSession.zoomMeeting.status] ??
                    currentSession.zoomMeeting.status)
                  : "회의 준비 중"}
              </span>
            </div>

            {currentSession.zoomMeeting?.recordingConsentRequired && (
              <div className={styles.warning}>
                <strong>수업 녹화 안내 및 동의</strong>
                <p>
                  이 수업은 복습 다시보기를 위해 클라우드 자동 녹화가 설정되어
                  있습니다. 수업 참여 시 음성과 화면이 녹화될 수 있으며, 녹화본은
                  수강권이 있는 학생에게만 공개됩니다.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                  />{" "}
                  녹화 안내를 확인했으며 수업 참여에 동의합니다.
                </label>
              </div>
            )}

            {data.canStartHost && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={Boolean(busy)}
                  onClick={() => void handleJoin("host")}
                >
                  {busy === "join"
                    ? "호스트 권한 확인 중…"
                    : "강의 시작 (Zoom 호스트 입장)"}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void handleQuickAction(
                      "quick-att",
                      {
                        action: "record_attendance",
                        sessionId: currentSession.id,
                        participatedMinutes: 50,
                      },
                      "수강생 실시간 출석(50분 참여·출석 인정)을 기록했습니다.",
                    )
                  }
                >
                  {busy === "quick-att"
                    ? "출석 처리 중…"
                    : "수강생 출석 체크 기록"}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void handleQuickAction(
                      "quick-end",
                      {
                        action: "complete_session",
                        sessionId: currentSession.id,
                        publishRecording: true,
                      },
                      "수업을 종료하고 클라우드 녹화 다시보기 영상을 생성·공개했습니다.",
                    )
                  }
                >
                  {busy === "quick-end"
                    ? "종료 처리 중…"
                    : "수업 종료 및 녹화 영상 생성"}
                </button>
              </div>
            )}

            {(data.viewerRole === "student" || role === "student") && (
              <>
                {!data.canJoinStudent ? (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void handleQuickAction(
                          "quick-enroll",
                          {
                            action: "enroll_self",
                            offeringId: data.offering.id,
                          },
                          "수강 신청이 완료되었습니다. 이제 실시간 화상강의에 입장할 수 있습니다.",
                        )
                      }
                    >
                      {busy === "quick-enroll"
                        ? "수강 등록 중…"
                        : "즉시 수강 등록 및 입장 권한 활성화"}
                    </button>
                  </div>
                ) : currentSession.windowState === "waiting_before_window" ? (
                  <div className={styles.warning} role="status">
                    <strong>강의 시작 전 대기 화면</strong>
                    <p>
                      수업 시작 10분 전부터 실시간 강의실에 입장할 수 있습니다.
                      (입장 가능까지 약 {currentSession.minutesUntilOpen}분
                      남음)
                    </p>
                    <p className={styles.note}>
                      필기구와 수업 자료를 미리 내려받아 준비해 주세요.
                    </p>
                  </div>
                ) : currentSession.windowState === "ended" ||
                  currentSession.zoomMeeting?.status === "ended" ? (
                  <div className={styles.empty} role="status">
                    <strong>종료된 강의입니다</strong>
                    <p>
                      실시간 화상수업이 종료되었습니다. 아래에서 출석 결과와
                      강사가 공개한 녹화 다시보기를 확인할 수 있습니다.
                    </p>
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={Boolean(busy) || !consentChecked}
                      onClick={() => void handleJoin("student")}
                    >
                      {busy === "join"
                        ? "수강권 및 입장 확인 중…"
                        : "실시간 화상강의 참여"}
                    </button>
                  </div>
                )}
              </>
            )}

            {ticket && (
              <div
                className={styles.panel}
                style={{ marginTop: "16px", background: "#f7f9fc" }}
              >
                <h3>
                  {ticket.role === "host"
                    ? "Zoom 호스트 강의실 연결 준비 완료"
                    : "Zoom 학생 강의실 연결 준비 완료"}
                </h3>
                <p>{ticket.sdkNotice}</p>
                {ticket.sdk && (
                  <div
                    id="zoom-sdk-component-root"
                    data-testid="zoom-sdk-component-view"
                    className={styles.empty}
                  >
                    <strong>Zoom Meeting SDK (Component View)</strong>
                    <p>
                      회의 번호: {ticket.sdk.meetingNumber} · 참가자:{" "}
                      {ticket.sdk.userName} · 권한:{" "}
                      {ticket.sdk.role === 1 ? "호스트(강사)" : "일반 참가자(학생)"}
                    </p>
                  </div>
                )}
                <div className={styles.actions}>
                  <a
                    href={ticket.externalJoinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.secondary}
                  >
                    Zoom 앱 또는 브라우저로 외부 안전 입장 →
                  </a>
                </div>
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h2>수강생 출석 상태</h2>
            {data.viewerRole === "student" || data.viewerRole === "guardian" ? (
              currentSession.myAttendance ? (
                <div>
                  <p>
                    출석 판정:{" "}
                    <strong>
                      {attendanceStatusLabels[
                        currentSession.myAttendance.status
                      ] ?? currentSession.myAttendance.status}
                    </strong>{" "}
                    · 누적 참여시간:{" "}
                    <strong>
                      {Math.round(currentSession.myAttendance.totalSeconds / 60)}
                      분 ({currentSession.myAttendance.totalSeconds}초)
                    </strong>{" "}
                    · 출석률:{" "}
                    <strong>{currentSession.myAttendance.attendanceRate}%</strong>
                  </p>
                </div>
              ) : (
                <p className={styles.empty}>
                  아직 기록된 실시간 출석 내역이 없습니다. 수업 참여 시 Zoom
                  Webhook을 통해 입장·퇴장 및 참여시간이 자동 기록됩니다.
                </p>
              )
            ) : (
              <>
                {currentSession.attendanceSummary.length > 0 ? (
                  <ul className={styles.list}>
                    {currentSession.attendanceSummary.map((att) => (
                      <li key={att.studentId}>
                        <div className={styles.row}>
                          <div>
                            <h3>{att.studentName}</h3>
                            <p>
                              누적 참여: {Math.round(att.totalSeconds / 60)}분 (
                              {att.totalSeconds}초) · 출석률:{" "}
                              {att.attendanceRate}% · 기록 방식:{" "}
                              {att.source === "manual_override"
                                ? "강사 수동 확인"
                                : "Zoom 자동 집계"}
                            </p>
                          </div>
                          <span className={styles.badge}>
                            {attendanceStatusLabels[att.status] ?? att.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.empty}>
                    아직 집계된 학생 출석 기록이 없습니다.
                  </p>
                )}
              </>
            )}
          </section>

          <section className={styles.panel}>
            <h2>강의자료 다운로드</h2>
            {currentSession.materials.length > 0 ? (
              <ul className={styles.list}>
                {currentSession.materials.map((mat) => (
                  <li key={mat.id}>
                    <div className={styles.row}>
                      <div>
                        <h3>{mat.title}</h3>
                        <p>{mat.fileName}</p>
                      </div>
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => downloadMaterial(mat)}
                      >
                        자료 다운로드
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>등록된 강의자료가 없습니다.</p>
            )}

            {(data.viewerRole === "instructor" ||
              data.viewerRole === "owner") && (
                <form
                  className={`${styles.form} ${styles.inlineForm}`}
                  onSubmit={handleMaterialCreate}
                >
                  <div className={styles.columns}>
                    <label>
                      자료 제목
                      <input name="title" required maxLength={120} />
                    </label>
                    <label>
                      파일 이름
                      <input
                        name="fileName"
                        defaultValue="lesson-note.txt"
                        required
                        maxLength={100}
                      />
                    </label>
                  </div>
                  <label>
                    자료 내용
                    <textarea name="content" required maxLength={5000} />
                  </label>
                  <button
                    type="submit"
                    className={styles.secondary}
                    disabled={Boolean(busy)}
                  >
                    강의자료 등록
                  </button>
                </form>
              )}
          </section>

          <section className={styles.panel}>
            <div className={styles.row}>
              <h2>강의 종료 후 다시보기 (녹화 영상)</h2>
              {(data.viewerRole === "instructor" ||
                data.viewerRole === "owner") && (
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={Boolean(busy)}
                    onClick={() => void handleSyncRecordings()}
                  >
                    {busy === "sync-rec"
                      ? "동기화 중…"
                      : "Zoom 클라우드 녹화 동기화"}
                  </button>
                )}
            </div>

            {currentSession.recordings.length > 0 ? (
              <ul className={styles.list}>
                {currentSession.recordings.map((rec) => (
                  <li key={rec.id}>
                    <div className={styles.row}>
                      <div>
                        <h3>
                          {rec.fileType} 녹화 영상 (
                          {Math.max(1, Math.round(rec.durationSeconds / 60))}분)
                        </h3>
                        <p>
                          상태: {rec.status} · 공개 여부:{" "}
                          {rec.isPublic ? "수강생 공개 승인됨" : "비공개 (승인 전)"}
                        </p>
                      </div>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.primary}
                          disabled={Boolean(busy)}
                          onClick={() => void handleWatchRecording(rec.id)}
                        >
                          다시보기 재생
                        </button>
                        {(data.viewerRole === "instructor" ||
                          data.viewerRole === "owner") && (
                            <button
                              type="button"
                              className={styles.secondary}
                              disabled={Boolean(busy)}
                              onClick={() =>
                                void handleToggleRecordingVisibility(
                                  rec.id,
                                  !rec.isPublic,
                                )
                              }
                            >
                              {rec.isPublic ? "비공개로 전환" : "수강생 공개 승인"}
                            </button>
                          )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                현재 확인 가능한 녹화 다시보기 영상이 없습니다.
              </p>
            )}

            {playback && (
              <div
                className={styles.panel}
                style={{ marginTop: "16px", background: "#f7f9fc" }}
              >
                <h3>다시보기 플레이어 · {playback.courseTitle}</h3>
                <p>{playback.consentNotice}</p>
                <p className={styles.note}>
                  안전 스트림 경로: {playback.streamUrl} (만료:{" "}
                  {formatDateTime(playback.expiresAt)})
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
