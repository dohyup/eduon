"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  dateTime,
  LearningGate,
  learningApi,
  learningError,
  LearningPanel,
  LearningState,
  useLearningResource,
} from "./shared";
import styles from "./learning.module.css";
type Report = {
  id: string;
  reviewId: string;
  reason: string;
  status: string;
  createdAt: string;
  resolution?: "keep" | "hide" | null;
  resolutionReason?: string | null;
  resolvedAt?: string | null;
  review: {
    id: string;
    rating: number;
    text: string;
    hiddenAt?: string | null;
  };
};
function ReportsList() {
  const resource = useLearningResource<{
    items: Report[];
    nextCursor: string | null;
  }>("/api/admin/reports");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  async function resolve(event: FormEvent<HTMLFormElement>, report: Report) {
    event.preventDefault();
    if (lock.current) return;
    const data = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(report.id);
    setError("");
    setMessage("");
    try {
      const result = await learningApi(
        `/api/admin/reports/${report.id}/resolve`,
        {
          action: data.get("action"),
          reason: String(data.get("reason")).trim(),
        },
      );
      if (!result.ok) setError(learningError(result.code));
      else {
        setMessage("선택한 후기 신고의 검토 결과와 사유를 기록했습니다.");
        await resource.reload();
      }
    } catch {
      setError(
        "검토 결과를 저장하지 못했습니다. 기존 처리 상태를 확인하고 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function more() {
    if (!resource.value?.nextCursor || lock.current) return;
    lock.current = true;
    setBusy("more");
    setError("");
    try {
      const result = await learningApi<{
        items: Report[];
        nextCursor: string | null;
      }>(
        `/api/admin/reports?cursor=${encodeURIComponent(resource.value.nextCursor)}`,
      );
      if (!result.ok) setError(learningError(result.code));
      else
        resource.setValue((previous) => ({
          items: [
            ...new Map(
              [...(previous?.items ?? []), ...result.value.items].map(
                (item) => [item.id, item],
              ),
            ).values(),
          ],
          nextCursor: result.value.nextCursor,
        }));
    } catch {
      setError("신고를 더 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  return (
    <LearningPanel title="수강 후기 신고 검토">
      <p>신고된 후기 내용을 확인하고 공개 유지 또는 숨김 사유를 기록하세요.</p>
      <LearningState {...resource} retry={() => void resource.reload()} />
      {message && (
        <p className={styles.success} role="status">
          {message}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {resource.value?.items.length === 0 && (
        <p className={styles.empty}>검토할 후기 신고가 없습니다.</p>
      )}
      <ul className={styles.list}>
        {resource.value?.items.map((report, index) => (
          <li key={report.id}>
            <h3>
              신고된 후기 {index + 1} · {report.review.rating}점
            </h3>
            <p className={styles.prewrap}>{report.review.text}</p>
            <p>
              <strong>신고 사유</strong> · {report.reason}
            </p>
            <p className={styles.muted}>
              접수 · {dateTime(report.createdAt)} ·{" "}
              {report.status === "open" ? "검토 대기" : "검토 완료"}
              {report.review.hiddenAt ? " · 현재 숨김" : " · 현재 공개"}
            </p>
            {report.status === "resolved" && (
              <p className={styles.history}>
                검토 결과 ·{" "}
                {report.resolution === "hide" ? "후기 숨김" : "공개 유지"}
                <br />
                {report.resolutionReason}
                {report.resolvedAt && (
                  <>
                    <br />
                    {dateTime(report.resolvedAt)}
                  </>
                )}
              </p>
            )}
            {report.status === "open" && (
              <form
                className={styles.form}
                onSubmit={(event) => void resolve(event, report)}
              >
                <fieldset disabled={Boolean(busy)}>
                  <label>
                    후기 검토 결과
                    <select name="action" aria-label="후기 검토 결과">
                      <option value="keep">공개 유지</option>
                      <option value="hide">후기 숨김</option>
                    </select>
                  </label>
                  <label>
                    검토 사유
                    <textarea name="reason" required maxLength={500} />
                  </label>
                  <button className={styles.primary}>
                    {busy === report.id
                      ? "검토 저장 중…"
                      : "이 후기의 검토 결과 저장"}
                  </button>
                </fieldset>
              </form>
            )}
          </li>
        ))}
      </ul>
      {resource.value?.nextCursor && (
        <button
          className={styles.secondary}
          disabled={Boolean(busy)}
          onClick={() => void more()}
        >
          {busy === "more" ? "불러오는 중…" : "신고 더 보기"}
        </button>
      )}
    </LearningPanel>
  );
}
export function AdminReports() {
  return <LearningGate>{() => <ReportsList />}</LearningGate>;
}
