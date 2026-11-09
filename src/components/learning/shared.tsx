"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { commerceApi, dateTime } from "../commerce/shared";
import styles from "./learning.module.css";

export { commerceApi as learningApi, dateTime };
export type LearningView = "student" | "parent" | "instructor";
export type Readiness = {
  enabled: boolean;
  videoConfigured: boolean;
  storageConfigured: boolean;
  scanningConfigured: boolean;
  testMode?: boolean;
};
export const learningError = (code: string) =>
  ({
    UNAUTHENTICATED: "로그인이 필요합니다. 다시 로그인해 주세요.",
    FORBIDDEN:
      "학습 내역에 접근할 권한이 없습니다. 현재 자녀 연결과 담당 수업을 확인해 주세요.",
    NOT_FOUND: "내역을 찾을 수 없거나 접근할 수 없습니다.",
    VALIDATION: "필수 입력값과 파일 형식·크기를 확인해 주세요.",
    CONFLICT:
      "현재 상태에서는 처리할 수 없습니다. 수강 권리와 수업 시간을 다시 확인해 주세요.",
    EXPIRED:
      "수업 입장 가능 시간이 아닙니다. 수업 일정에 맞춰 다시 시도해 주세요.",
    UNAVAILABLE:
      "학습 서비스 연결이 준비되지 않았습니다. 운영자에게 문의해 주세요.",
    PROVIDER_UNAVAILABLE:
      "외부 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하거나 학원에 문의해 주세요.",
    RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  })[code] ??
  "처리하지 못했습니다. 작성 내용은 유지됩니다. 다시 시도해 주세요.";
export function useLearningResource<T>(url: string | null) {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++generation.current;
      setLoading(Boolean(url));
      setError("");
      setValue(null);
      if (!url) return;
      try {
        const result = await commerceApi<T>(url, undefined, signal);
        if (signal?.aborted || generation.current !== version) return;
        if (result.ok) setValue(result.value);
        else setError(learningError(result.code));
      } catch {
        if (!signal?.aborted && generation.current === version)
          setError(
            "학습 내역을 불러오지 못했습니다. 연결을 확인한 후 다시 시도해 주세요.",
          );
      } finally {
        if (!signal?.aborted && generation.current === version)
          setLoading(false);
      }
    },
    [url],
  );
  useEffect(() => {
    const controller = new AbortController();
    // Synchronize the selected authorized resource after the request completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(controller.signal);
    return () => {
      controller.abort();
    };
  }, [reload]);
  return { value, setValue, loading, error, reload };
}
export function LearningState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return (
    <>
      {loading && <p role="status">학습 내역을 확인하는 중입니다…</p>}
      {error && (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <button
            className={styles.secondary}
            onClick={retry}
            disabled={loading}
          >
            다시 불러오기
          </button>
        </div>
      )}
    </>
  );
}
export function LearningPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function LearningGate({
  children,
}: {
  children: (readiness: Readiness) => ReactNode;
}) {
  const state = useLearningResource<Readiness>("/api/learning/readiness");
  return (
    <div className={styles.stack}>
      <LearningState {...state} retry={() => void state.reload()} />
      {state.value &&
        (state.value.enabled ? (
          children(state.value)
        ) : (
          <LearningPanel title="학습 서비스 연결 준비">
            <p>
              수업 입장·출결·과제 기능을 사용하려면 학습 서비스 설정이
              필요합니다. 학원 또는 운영자에게 문의해 주세요.
            </p>
            <p className={styles.muted}>
              기존 자녀 관리와 결제 내역은 각 메뉴에서 계속 확인할 수 있습니다.
            </p>
          </LearningPanel>
        ))}
    </div>
  );
}
export const statusLabel = (status: string) =>
  ({
    active: "수강 중",
    completed: "수강 완료",
    cancelled: "취소",
    allowed: "수강 가능",
    refund_pending: "취소 처리 중 · 입장 중지",
    present: "출석",
    absent: "결석",
    late: "지각",
    clean: "안전 검사 완료",
    quarantined: "격리 · 검사 대기",
    rejected: "안전 검사 거부",
  })[status] ?? "상태 확인 필요";
