"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  commerceApi,
  commerceError,
  requestKey,
  ResourceState,
  useCommerceResource,
} from "./shared";
import type { CommerceMe } from "./shared";
import styles from "./commerce.module.css";

export function Enroll({
  offeringId,
  paymentConfigured,
}: {
  offeringId: string;
  paymentConfigured: boolean;
}) {
  const me = useCommerceResource<CommerceMe>("/api/me");
  const [childId, setChildId] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const router = useRouter();
  const selectedId = childId || me.value?.children[0]?.id || "";
  const child = me.value?.children.find((item) => item.id === selectedId);
  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      lock.current ||
      !paymentConfigured ||
      !child ||
      !consent ||
      !me.value?.user.guardianVerifiedAt
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = { studentId: child.id, offeringId, consent: true };
      const result = await commerceApi<{ orderId: string }>("/api/orders", {
        ...payload,
        requestKey: requestKey(
          `order:${me.value.user.id}:${offeringId}`,
          payload,
        ),
      });
      if (!result.ok) setError(commerceError(result.code));
      else router.push(`/checkout/${encodeURIComponent(result.value.orderId)}`);
    } catch {
      setError(
        "신청 결과를 확인하지 못했습니다. 같은 자녀로 다시 시도하면 기존 요청을 확인합니다.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.form}>
      {!paymentConfigured && (
        <p className={styles.notice}>
          결제 서비스 설정이 필요합니다. 신청과 결제는 아직 비활성 상태입니다.
        </p>
      )}
      <ResourceState
        loading={me.loading}
        error={me.error}
        retry={() => void me.reload()}
      />
      {!me.value && !me.loading && (
        <Link className={styles.primary} href="/login">
          로그인하고 신청하기
        </Link>
      )}
      {me.value && !me.value.user.guardianVerifiedAt && (
        <p className={styles.notice}>
          보호자 확인 후 신청할 수 있습니다.{" "}
          <Link href="/parent/children">자녀 연결 상태 확인</Link>
        </p>
      )}
      {me.value?.user.guardianVerifiedAt &&
        (me.value.children.length ? (
          <form className={styles.form} onSubmit={enroll} aria-busy={busy}>
            <label>
              수강할 자녀
              <select
                value={selectedId}
                disabled={busy || !paymentConfigured}
                onChange={(event) => {
                  setChildId(event.target.value);
                  setConsent(false);
                  setError("");
                }}
              >
                {me.value.children.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.notice}>
              테스트 전용 정책 · 실제 청구가 아닙니다. 다음 화면에서{" "}
              {child?.name} 학생의 일정, 총액과 회차별 환불 조건을 확인해
              주세요. 좌석은 신청 후 10분간 예약됩니다.
            </p>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={consent}
                disabled={busy || !paymentConfigured}
                required
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                {child?.name} 학생의 신청 내용과 테스트 전용 정책을 확인했으며,
                주문에 이 확인 기록을 남기는 데 동의합니다.
              </span>
            </label>
            <button
              className={styles.primary}
              disabled={busy || !paymentConfigured || !consent}
            >
              {busy ? "좌석 확인 중…" : "신청 내용 확인하기"}
            </button>
          </form>
        ) : (
          <p className={styles.notice}>
            연결된 자녀가 없습니다.{" "}
            <Link href="/parent/children">자녀를 먼저 연결해 주세요.</Link>
          </p>
        ))}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
