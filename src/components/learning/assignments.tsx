"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { dateTime, learningApi, learningError, LearningPanel } from "./shared";
import type { Readiness } from "./shared";
import { Download, UploadFiles } from "./files";
import type {
  AssignmentView,
  LearningDetailView,
  SubmissionView,
} from "./types";
import styles from "./learning.module.css";

function FeedbackForm({
  submission,
  reload,
}: {
  submission: SubmissionView;
  reload: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await learningApi(
        `/api/submissions/${submission.id}/feedback`,
        { text: text.trim() },
      );
      if (!result.ok) setError(learningError(result.code));
      else {
        setText("");
        setMessage("피드백을 기록했습니다. 기존 피드백 이력도 보존됩니다.");
        await reload();
      }
    } catch {
      setError(
        "피드백을 기록하지 못했습니다. 작성 내용을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label>
        {submission.version}차 제출에 대한 피드백
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          required
          maxLength={10000}
          disabled={busy}
        />
      </label>
      <button className={styles.primary} disabled={busy || !text.trim()}>
        {busy ? "피드백 저장 중…" : "피드백 기록"}
      </button>
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
    </form>
  );
}
function SubmissionForm({
  assignment,
  detail,
  readiness,
  reload,
}: {
  assignment: AssignmentView;
  detail: LearningDetailView;
  readiness: Readiness;
  reload: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<
    { materialId: string; filename: string; scanStatus: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || uploading || files.length > 5) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await learningApi(
        `/api/assignments/${assignment.id}/submissions`,
        {
          text: text.trim(),
          fileIds: files
            .filter((file) => file.scanStatus === "clean")
            .map((file) => file.materialId),
        },
      );
      if (!result.ok) setError(learningError(result.code));
      else {
        setText("");
        setFiles([]);
        await reload();
      }
    } catch {
      setError(
        "제출 결과를 확인하지 못했습니다. 제출 이력을 새로 확인한 후 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <label>
          과제 답안
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={10000}
            required={!files.some((file) => file.scanStatus === "clean")}
          />
        </label>
        <UploadFiles
          offeringId={detail.id}
          purpose="submission"
          readiness={readiness}
          multiple
          disabled={files.length >= 5}
          maxFiles={5 - files.length}
          onBusyChange={setUploading}
          onUploaded={(file) => setFiles((previous) => [...previous, file])}
        />
        {files.length > 0 && (
          <ul className={styles.fileList}>
            {files.map((file) => (
              <li key={file.materialId}>
                {file.filename} ·{" "}
                {file.scanStatus === "clean"
                  ? "검사 완료 · 제출 첨부 가능"
                  : "검사 미완료 · 제출에서 제외"}
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() =>
                    setFiles((previous) =>
                      previous.filter(
                        (item) => item.materialId !== file.materialId,
                      ),
                    )
                  }
                >
                  {file.filename} 첨부 제외
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.muted}>
          마감 이후에도 제출할 수 있으며 늦은 제출로 표시됩니다. 재제출하면 이전
          답안과 피드백 이력이 보존됩니다.
        </p>
        <button
          className={styles.primary}
          disabled={
            busy ||
            uploading ||
            files.length > 5 ||
            (!text.trim() && !files.some((file) => file.scanStatus === "clean"))
          }
        >
          {busy
            ? "과제 제출 중…"
            : assignment.submissions.length
              ? "새 버전으로 재제출"
              : "과제 제출"}
        </button>
      </fieldset>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
function Assignment({
  assignment,
  detail,
  readiness,
  studentId,
  reload,
}: {
  assignment: AssignmentView;
  detail: LearningDetailView;
  readiness: Readiness;
  studentId?: string;
  reload: () => Promise<void>;
}) {
  const [additional, setAdditional] = useState<SubmissionView[]>([]);
  const [cursor, setCursor] = useState(
    assignment.submissionsNextCursor ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({ cursor });
      if (studentId) query.set("studentId", studentId);
      const result = await learningApi<{
        items: SubmissionView[];
        nextCursor: string | null;
      }>(`/api/assignments/${assignment.id}/submissions?${query}`);
      if (!result.ok) setError(learningError(result.code));
      else {
        setAdditional((previous) => [
          ...new Map(
            [...previous, ...result.value.items].map((item) => [item.id, item]),
          ).values(),
        ]);
        setCursor(result.value.nextCursor);
      }
    } catch {
      setError("이전 제출 기록을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  const submissions = [
    ...new Map(
      [...assignment.submissions, ...additional].map((item) => [item.id, item]),
    ).values(),
  ];
  return (
    <li>
      <h3>{assignment.title}</h3>
      <p className={styles.prewrap}>{assignment.instructions}</p>
      <p className={styles.muted}>
        마감 · {dateTime(assignment.dueAt)} (한국시간)
      </p>
      {submissions.length === 0 && (
        <p className={styles.empty}>아직 제출한 답안이 없습니다.</p>
      )}
      {submissions.map((submission) => (
        <section
          className={styles.history}
          key={submission.id}
          aria-label={`${submission.version}차 제출 기록`}
        >
          <h4>
            {detail.role === "instructor"
              ? `${submission.studentName ?? detail.roster?.find((student) => student.id === submission.studentId)?.name ?? "학생"} · `
              : ""}
            {submission.version}차 제출 ·{" "}
            {submission.late ? "늦은 제출" : "기한 내 제출"}
          </h4>
          <p className={styles.muted}>{dateTime(submission.submittedAt)}</p>
          <p>{submission.text}</p>
          <ul className={styles.fileList}>
            {submission.files.map((file) => (
              <li key={file.materialId}>
                <Download
                  materialId={file.materialId}
                  filename={file.filename}
                  studentId={studentId}
                  assignmentId={assignment.id}
                />
              </li>
            ))}
          </ul>
          {submission.feedback.length === 0 && (
            <p className={styles.muted}>아직 강사 피드백이 없습니다.</p>
          )}
          {submission.feedback.map((feedback) => (
            <div key={feedback.id}>
              <h5>{feedback.version}차 강사 피드백</h5>
              <p>{feedback.text}</p>
              <p className={styles.muted}>{dateTime(feedback.createdAt)}</p>
            </div>
          ))}
          {detail.role === "instructor" && (
            <FeedbackForm submission={submission} reload={reload} />
          )}
        </section>
      ))}
      {cursor && (
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => void more()}
        >
          {busy ? "이력 불러오는 중…" : "이전 제출·피드백 더 보기"}
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {detail.role === "student" &&
        ["active", "completed"].includes(detail.enrollment?.status ?? "") && (
          <details className={styles.details}>
            <summary>
              {assignment.submissions.length ? "과제 재제출" : "과제 답안 작성"}
            </summary>
            <SubmissionForm
              assignment={assignment}
              detail={detail}
              readiness={readiness}
              reload={reload}
            />
          </details>
        )}
    </li>
  );
}
export function Assignments({
  detail,
  readiness,
  studentId,
  reload,
}: {
  detail: LearningDetailView;
  readiness: Readiness;
  studentId?: string;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const local = String(data.get("dueAt"));
      const sessionId = String(data.get("sessionId") ?? "");
      const result = await learningApi("/api/assignments", {
        offeringId: detail.id,
        title: String(data.get("title")).trim(),
        instructions: String(data.get("instructions")).trim(),
        dueAt: new Date(`${local}+09:00`).toISOString(),
        ...(sessionId ? { sessionId } : {}),
      });
      if (!result.ok) setError(learningError(result.code));
      else {
        form.reset();
        await reload();
      }
    } catch {
      setError(
        "과제를 등록하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <LearningPanel title="과제·제출·강사 피드백">
      {detail.role === "instructor" && (
        <details className={styles.details}>
          <summary>새 과제 등록</summary>
          <form
            className={styles.form}
            onSubmit={(event) => void create(event)}
          >
            <fieldset disabled={busy}>
              <label>
                과제 제목
                <input name="title" required maxLength={160} />
              </label>
              <label>
                과제 안내
                <textarea name="instructions" required maxLength={10000} />
              </label>
              <label>
                관련 회차 (선택)
                <select name="sessionId">
                  <option value="">수업 전체</option>
                  {detail.sessions.map((session, index) => (
                    <option key={session.id} value={session.id}>
                      {index + 1}회차 · {dateTime(session.startsAt)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                제출 마감 (한국시간)
                <input name="dueAt" type="datetime-local" required />
              </label>
              <button className={styles.primary}>
                {busy ? "과제 등록 중…" : "과제 등록"}
              </button>
            </fieldset>
          </form>
        </details>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {detail.assignments.length === 0 && (
        <p className={styles.empty}>등록된 과제가 없습니다.</p>
      )}
      <ul className={styles.list}>
        {detail.assignments.map((assignment) => (
          <Assignment
            key={assignment.id}
            assignment={assignment}
            detail={detail}
            readiness={readiness}
            studentId={studentId}
            reload={reload}
          />
        ))}
      </ul>
    </LearningPanel>
  );
}
