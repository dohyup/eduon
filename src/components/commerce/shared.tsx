"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import styles from "./commerce.module.css";

export type Outcome<T> =
  | { ok: true; value: T; nextCursor?: string | null }
  | { ok: false; code: string };
export type CommerceMe = {
  user: { id: string; guardianVerifiedAt: string | null };
  children: { id: string; name: string; grade: number }[];
  memberships: { role: string; academy: { id: string; name: string } }[];
};
export async function commerceApi<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Outcome<T>> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const result = (await response.json()) as Outcome<T>;
  if (!response.ok && result.ok) return { ok: false, code: "UNAVAILABLE" };
  return result;
}
const errors: Record<string, string> = {
  UNAUTHENTICATED: "로그인이 필요합니다. 로그인 후 다시 확인해 주세요.",
  FORBIDDEN:
    "이 내역에 접근할 권한이 없습니다. 보호자 확인과 연결된 자녀를 확인해 주세요.",
  NOT_FOUND: "내역을 찾을 수 없거나 접근할 수 없습니다.",
  VALIDATION: "자녀, 회차와 필수 입력 내용을 확인해 주세요.",
  CONFLICT: "현재 상태가 변경되었습니다. 내역을 새로 불러와 확인해 주세요.",
  SOLD_OUT: "마감된 수업입니다. 다른 수업을 선택해 주세요.",
  EXPIRED: "좌석 예약 시간이 지났습니다. 수업 상세에서 다시 신청해 주세요.",
  UNAVAILABLE: "결제 서비스 설정이 필요합니다. 운영자에게 문의해 주세요.",
  PROVIDER_UNAVAILABLE:
    "결제 서비스에 연결하지 못했습니다. 내역을 확인한 후 다시 시도해 주세요.",
  RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  SCHEDULE_CONFLICT: "선택한 자녀의 다른 수업과 시간이 겹칩니다.",
  PAYMENT_PENDING: "결제 확인을 기다리고 있습니다. 내역을 새로 불러와 주세요.",
};
export function commerceError(code: string) {
  return (
    errors[code] ??
    "요청을 처리하지 못했습니다. 입력 내용은 유지됩니다. 내역을 확인한 후 다시 시도해 주세요."
  );
}
export function requestKey(scope: string, payload: unknown) {
  const storageKey = `eduon-commerce:${scope}`;
  const signature = JSON.stringify(payload);
  try {
    const previous = JSON.parse(
      sessionStorage.getItem(storageKey) || "null",
    ) as { signature: string; key: string } | null;
    if (previous?.signature === signature) return previous.key;
    const key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, JSON.stringify({ signature, key }));
    return key;
  } catch {
    throw new Error("REQUEST_KEY_UNAVAILABLE");
  }
}
export function restartEnrollment(studentId: string, offeringId: string) {
  // Only an explicit retry after expiry starts a new reservation intent.
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith("eduon-commerce:order:")) continue;
      const intent = JSON.parse(sessionStorage.getItem(key) || "null") as {
        signature?: string;
      } | null;
      if (!intent?.signature) continue;
      const payload = JSON.parse(intent.signature) as {
        studentId?: string;
        offeringId?: string;
      };
      if (payload.studentId === studentId && payload.offeringId === offeringId)
        sessionStorage.removeItem(key);
    }
  } catch {
    /* If storage is unavailable, the request form reports an error. */
  }
}
export function useCommerceResource<T>(url: string | null) {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!url) return;
      setLoading(true);
      setError("");
      try {
        const result = await commerceApi<T>(url, undefined, signal);
        if (signal?.aborted) return;
        if (result.ok) {
          setValue(result.value);
          setCursor(result.nextCursor ?? null);
        } else {
          setValue(null);
          setError(commerceError(result.code));
        }
      } catch {
        if (!signal?.aborted)
          setError(
            "내역을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [url],
  );
  useEffect(() => {
    const controller = new AbortController();
    // External API synchronization; updates resume after fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);
  return { value, setValue, loading, error, cursor, setCursor, reload };
}
export function CommercePanel({
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
export function ResourceState({
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
      {loading && <p role="status">내역을 확인하는 중입니다…</p>}
      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button
            type="button"
            disabled={loading}
            onClick={retry}
            className={styles.secondary}
          >
            다시 불러오기
          </button>
        </div>
      )}
    </>
  );
}
const states: Record<string, string> = {
  pending_payment: "결제 대기",
  payment_exception: "결제 확인 필요",
  pending: "처리 대기",
  paid: "결제 완료",
  expired: "예약 만료",
  failed: "처리 실패",
  cancelled: "취소",
  partially_refunded: "부분 환불 완료",
  refunded: "환불 완료",
  requested: "취소 처리 중",
  processing: "처리 중",
  succeeded: "처리 완료",
  allowed: "수강 가능",
  refund_pending: "취소 처리 중 · 입장 일시 중지",
  completed: "이수 완료",
  payment: "결제",
  refund: "환불",
  fee: "수수료",
  adjustment: "지급 조정",
  payout: "외부 지급",
  unpaid: "지급 대기",
};
export const stateLabel = (state: string) => states[state] ?? "상태 확인 필요";
export const won = (amount: number) =>
  `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
export const dateTime = (date: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
