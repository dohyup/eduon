"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  dateTime,
  learningApi,
  learningError,
  LearningPanel,
  LearningState,
  useLearningResource,
} from "./shared";
import styles from "./learning.module.css";
type PublicReview = {
  id: string;
  rating: number;
  text: string;
  createdAt: string;
};
function ReportForm({ review }: { review: PublicReview }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await learningApi(`/api/reviews/${review.id}/report`, {
        reason: String(data.get("reason")).trim(),
      });
      if (!result.ok) setError(learningError(result.code));
      else {
        form.reset();
        setMessage(
          "후기 신고를 접수했습니다. 운영자가 내용과 사유를 검토합니다.",
        );
      }
    } catch {
      setError("신고 결과를 확인하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className={styles.details}>
      <summary>이 후기 신고</summary>
      <form className={styles.form} onSubmit={(event) => void report(event)}>
        <label>
          후기 신고 사유
          <textarea name="reason" maxLength={500} required disabled={busy} />
        </label>
        <button className={styles.secondary} disabled={busy}>
          {busy ? "신고 접수 중…" : "선택한 후기 신고 접수"}
        </button>
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
      </form>
    </details>
  );
}
export function LearningReviews({ offeringId }: { offeringId: string }) {
  const resource = useLearningResource<{
    items: PublicReview[];
    nextCursor: string | null;
  }>(`/api/reviews?offeringId=${encodeURIComponent(offeringId)}`);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function more() {
    if (!resource.value?.nextCursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await learningApi<{
        items: PublicReview[];
        nextCursor: string | null;
      }>(
        `/api/reviews?offeringId=${encodeURIComponent(offeringId)}&cursor=${encodeURIComponent(resource.value.nextCursor)}`,
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
      setError("후기를 더 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <LearningPanel title="완료 수강 후기">
      <LearningState {...resource} retry={() => void resource.reload()} />
      {resource.value?.items.length === 0 && (
        <p className={styles.empty}>현재 공개된 완료 수강 후기가 없습니다.</p>
      )}
      <ul className={styles.list}>
        {resource.value?.items.map((review) => (
          <li key={review.id}>
            <h3>수강 후기 · {review.rating}점 / 5점</h3>
            <p className={styles.prewrap}>{review.text}</p>
            <p className={styles.muted}>{dateTime(review.createdAt)}</p>
            <ReportForm review={review} />
          </li>
        ))}
      </ul>
      {resource.value?.nextCursor && (
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => void more()}
        >
          후기 더 보기
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </LearningPanel>
  );
}
