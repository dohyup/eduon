"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { learningApi, learningError } from "./shared";
import styles from "./learning.module.css";
export function NextCohortForm({
  offeringId,
  title,
  priceWon,
  capacity,
  instructors,
  onCreated,
}: {
  offeringId: string;
  title: string;
  priceWon: number;
  capacity: number;
  instructors: { userId: string; email: string }[];
  onCreated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget,
      data = new FormData(form);
    const date = (field: string) =>
      new Date(`${String(data.get(field))}+09:00`);
    const opens = date("opensAt"),
      closes = date("closesAt"),
      starts = date("startsAt"),
      ends = date("endsAt");
    if (
      [opens, closes, starts, ends].some((value) =>
        Number.isNaN(value.getTime()),
      ) ||
      opens >= closes ||
      closes > starts ||
      starts >= ends
    ) {
      setError(
        "모집 시작·종료와 수업 시작·종료 순서를 확인해 주세요. 모두 한국시간으로 입력합니다.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await learningApi(`/api/offerings/${offeringId}/cohorts`, {
        priceWon: Number(data.get("priceWon")),
        capacity: Number(data.get("capacity")),
        enrollmentOpensAt: opens.toISOString(),
        enrollmentClosesAt: closes.toISOString(),
        instructorIds: [String(data.get("instructorId"))],
        sessions: [
          { startsAt: starts.toISOString(), endsAt: ends.toISOString() },
        ],
      });
      if (!result.ok) setError(learningError(result.code));
      else {
        form.reset();
        setMessage(
          "같은 과정의 다음 기수 초안을 만들었습니다. 등록된 수업에서 가격·일정을 확인하고 공개하세요.",
        );
        await onCreated();
      }
    } catch {
      setError(
        "다음 기수를 만들지 못했습니다. 등록된 수업을 확인한 후 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className={styles.details}>
      <summary>같은 과정의 다음 기수 개설</summary>
      <p className={styles.muted}>
        {title} 과정의 과목·학년·수준을 이어받아 새 수업 기수를 만듭니다.
        가격·일정·정원은 새로 설정하며 기존 결제와 수강권은 이전되지 않습니다.
      </p>
      <form className={styles.form} onSubmit={(event) => void create(event)}>
        <fieldset disabled={busy}>
          <div className={styles.columns}>
            <label>
              다음 기수 총 수강료 (원)
              <input
                type="number"
                name="priceWon"
                defaultValue={priceWon}
                min={1}
                max={10000000}
                step={1}
                required
              />
            </label>
            <label>
              다음 기수 정원 (명)
              <input
                type="number"
                name="capacity"
                defaultValue={capacity}
                min={1}
                max={100}
                step={1}
                required
              />
            </label>
          </div>
          <label>
            다음 기수 담당 강사
            <select
              name="instructorId"
              aria-label="다음 기수 담당 강사"
              required
            >
              {instructors.map((instructor) => (
                <option key={instructor.userId} value={instructor.userId}>
                  {instructor.email}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.columns}>
            <label>
              다음 기수 모집 시작
              <input name="opensAt" type="datetime-local" required />
            </label>
            <label>
              다음 기수 모집 종료
              <input name="closesAt" type="datetime-local" required />
            </label>
            <label>
              다음 기수 수업 시작
              <input name="startsAt" type="datetime-local" required />
            </label>
            <label>
              다음 기수 수업 종료
              <input name="endsAt" type="datetime-local" required />
            </label>
          </div>
          <p className={styles.muted}>
            일시는 모두 한국시간(Asia/Seoul)입니다. 회차 1개인 초안을 만들고
            확인 후 공개합니다.
          </p>
          <button className={styles.primary}>
            {busy ? "다음 기수 등록 중…" : "이 과정의 다음 기수 초안 등록"}
          </button>
        </fieldset>
      </form>
      {message && (
        <p role="status" className={styles.success}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </details>
  );
}
