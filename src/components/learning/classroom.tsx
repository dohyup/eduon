"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  dateTime,
  learningApi,
  learningError,
  LearningPanel,
  statusLabel,
} from "./shared";
import type { Readiness } from "./shared";
import type { LearningDetailView } from "./types";
import styles from "./learning.module.css";

export function Classroom({
  detail,
  readiness,
  reload,
}: {
  detail: LearningDetailView;
  readiness: Readiness;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  async function join(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      const result = await learningApi<{ joinUrl: string; expiresAt: string }>(
        `/api/sessions/${id}/join`,
        {},
      );
      if (!result.ok) setError(learningError(result.code));
      else {
        // Issued only after an explicit action; never persist or log signed links.
        window.open(result.value.joinUrl, "_blank", "noopener,noreferrer");
        setMessage(
          "새 창에서 수업 입장을 요청했습니다. 창이 열리지 않았다면 팝업 허용 후 다시 시도해 주세요. 출석은 강사가 별도로 기록합니다.",
        );
      }
    } catch {
      setError(
        "수업 입장에 연결하지 못했습니다. 다시 시도하거나 학원에 문의해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function attendance(
    event: FormEvent<HTMLFormElement>,
    sessionId: string,
  ) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    lock.current = true;
    setBusy(`attendance:${sessionId}`);
    setError("");
    setMessage("");
    try {
      const result = await learningApi(
        `/api/sessions/${sessionId}/attendance`,
        {
          studentId: data.get("studentId"),
          status: data.get("status"),
          reason: String(data.get("reason")).trim(),
        },
      );
      if (!result.ok)
        setError(
          result.code === "VALIDATION"
            ? "출결은 수업 시작 후에 기록할 수 있습니다. 선택한 학생과 출결 사유도 확인해 주세요."
            : learningError(result.code),
        );
      else {
        setMessage("출결과 기록 사유를 저장했습니다.");
        await reload();
      }
    } catch {
      setError(
        "출결을 저장하지 못했습니다. 입력 내용을 확인한 후 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const teacher = detail.role === "instructor";
  return (
    <LearningPanel title={teacher ? "회차별 수업·출결 기록" : "수업 일정·출결"}>
      <p className={styles.muted}>
        모든 일정은 한국시간(Asia/Seoul)입니다. 입장 권리는 요청할 때마다
        확인합니다. 접속 기록이 자동으로 출석 처리되지는 않습니다.
      </p>
      {!readiness.videoConfigured && (
        <p className={styles.notice}>
          화상수업 제공자 설정이 필요합니다. 입장이 준비되지 않은 경우 학원에
          수업 안내·재일정을 문의해 주세요.
        </p>
      )}
      {"testMode" in readiness && readiness.testMode === true && (
        <p className={styles.notice}>
          테스트 전용 모의 입장입니다. 실제 화상·카메라 연결은 제공하지
          않습니다.
        </p>
      )}
      {detail.student && (
        <p className={styles.student}>학생 · {detail.student.name}</p>
      )}
      {detail.sessions.length === 0 && (
        <p className={styles.empty}>등록된 수업 일정이 없습니다.</p>
      )}
      <ul className={styles.list}>
        {detail.sessions.map((session, index) => (
          <li key={session.id}>
            <div className={styles.row}>
              <h3>
                {index + 1}회차 · {dateTime(session.startsAt)}
              </h3>
              {session.rightStatus && (
                <span className={styles.badge}>
                  {statusLabel(session.rightStatus)}
                </span>
              )}
            </div>
            <p className={styles.muted}>종료 · {dateTime(session.endsAt)}</p>
            {detail.role !== "parent" && (
              <button
                className={styles.primary}
                disabled={
                  Boolean(busy) ||
                  !readiness.videoConfigured ||
                  (!teacher && session.rightStatus !== "allowed")
                }
                onClick={() => void join(session.id)}
              >
                {busy === session.id
                  ? "입장 확인 중…"
                  : `${index + 1}회차 수업 입장`}
              </button>
            )}
            {detail.role === "parent" && (
              <p className={styles.muted}>
                수업 입장은 연결된 학생 계정에서 가능합니다.
              </p>
            )}
            {(session.attendance?.length ?? 0) === 0 && (
              <p className={styles.muted}>
                강사가 아직 출결을 기록하지 않았습니다.
              </p>
            )}
            <ul className={styles.list}>
              {session.attendance?.map((item) => (
                <li key={item.studentId}>
                  <p>
                    <strong>
                      {detail.roster?.find(
                        (student) => student.id === item.studentId,
                      )?.name ??
                        detail.student?.name ??
                        "학생"}
                    </strong>{" "}
                    ·{" "}
                    <span className={styles.badge}>
                      {statusLabel(item.status)}
                    </span>
                  </p>
                  <p className={styles.prewrap}>{item.reason}</p>
                  <p className={styles.muted}>
                    기록 · {dateTime(item.recordedAt)}
                  </p>
                  {Boolean(item.revisions?.length) && (
                    <details className={styles.details}>
                      <summary>출결 변경 이력</summary>
                      {item.revisions?.map((revision, version) => (
                        <p
                          key={`${revision.createdAt}:${version}`}
                          className={styles.history}
                        >
                          {statusLabel(revision.status)} · {revision.reason}
                          <br />
                          {dateTime(revision.createdAt)}
                        </p>
                      ))}
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {teacher && Boolean(detail.roster?.length) && (
              <details className={styles.details}>
                <summary>{index + 1}회차 출결 입력·수정</summary>
                <form
                  className={styles.form}
                  onSubmit={(event) => void attendance(event, session.id)}
                >
                  <fieldset disabled={Boolean(busy)}>
                    <label>
                      출결을 기록할 학생
                      <select name="studentId" required>
                        {detail.roster?.map((student) => (
                          <option value={student.id} key={student.id}>
                            {student.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      출결 상태
                      <select name="status" defaultValue="present">
                        <option value="present">출석</option>
                        <option value="late">지각</option>
                        <option value="absent">결석</option>
                      </select>
                    </label>
                    <label>
                      출결 기록·변경 사유
                      <textarea name="reason" required maxLength={1000} />
                    </label>
                    <button className={styles.primary}>
                      {busy === `attendance:${session.id}`
                        ? "출결 저장 중…"
                        : `${index + 1}회차 출결 저장`}
                    </button>
                  </fieldset>
                </form>
              </details>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className={styles.success} role="status">
          {message}
        </p>
      )}
    </LearningPanel>
  );
}
