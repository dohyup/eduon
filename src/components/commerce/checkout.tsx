"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { OrderPolicy, OrderSummary } from "./orders";
import type { OrderView } from "./orders";
import {
  CommercePanel,
  commerceApi,
  commerceError,
  dateTime,
  requestKey,
  restartEnrollment,
  ResourceState,
  stateLabel,
  useCommerceResource,
  won,
} from "./shared";
import styles from "./commerce.module.css";

type Readiness = {
  configured: boolean;
  provider: "portone-v2" | "fake" | null;
  mode: "test" | null;
  reason?: string;
};
type Prepared = {
  provider: "fake";
  mode: "test";
  orderId: string;
  transactionId: string;
  checkout: { kind: "test" };
};
export function Checkout({
  orderId,
  readiness,
  resultOnly = false,
}: {
  orderId: string;
  readiness: Readiness;
  resultOnly?: boolean;
}) {
  const resource = useCommerceResource<OrderView>(
    `/api/orders/${encodeURIComponent(orderId)}`,
  );
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const lock = useRef(false);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const order = resource.value;
  const expired =
    !!order &&
    (order.status === "expired" ||
      (order.status === "pending_payment" &&
        new Date(order.expiresAt).getTime() <= clock));
  const payable =
    order?.status === "pending_payment" &&
    !expired &&
    readiness.configured &&
    readiness.provider === "fake" &&
    readiness.mode === "test";
  async function confirmPayment(transactionId: string) {
    const result = await commerceApi<unknown>("/api/payments/confirm", {
      orderId,
      transactionId,
    });
    if (!result.ok) setError(commerceError(result.code));
    else
      setMessage(
        "결제 기관의 조회 결과를 확인했습니다. 아래 주문 상태를 확인해 주세요.",
      );
    await resource.reload();
  }
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !payable || !consent) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await commerceApi<Prepared>("/api/payments/prepare", {
        orderId,
        requestKey: requestKey(`payment:${orderId}`, { orderId }),
      });
      if (!result.ok) {
        setError(commerceError(result.code));
        return;
      }
      const value = result.value;
      if (value.orderId !== orderId || value.mode !== "test") {
        setError(
          "허용된 테스트 결제 설정을 확인하지 못했습니다. 운영자에게 문의해 주세요.",
        );
        return;
      }
      if (
        value.checkout.kind !== "test" ||
        readiness.provider !== "fake" ||
        value.provider !== "fake"
      ) {
        setError("허용된 내부 테스트 결제 설정을 확인하지 못했습니다.");
        return;
      }
      setPrepared(value);
      setMessage(
        "격리된 테스트 결제가 준비되었습니다. 아래 모의 결제 버튼으로 진행해 주세요.",
      );
    } catch {
      setError(
        "결제 결과를 확인하지 못했습니다. 중복 결제 전에 주문 상태를 새로 확인해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function fakePay() {
    if (
      lock.current ||
      prepared?.checkout.kind !== "test" ||
      prepared.mode !== "test" ||
      prepared.provider !== "fake" ||
      !consent ||
      readiness.provider !== "fake" ||
      !payable
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await commerceApi<unknown>("/api/payments/test", {
        orderId,
      });
      if (!result.ok) setError(commerceError(result.code));
      else
        setMessage(
          "모의 결제 요청을 처리했습니다. 서버가 확인한 주문 상태를 확인해 주세요.",
        );
      await resource.reload();
    } catch {
      setError(
        "모의 결제 결과를 확인하지 못했습니다. 주문 상태를 다시 확인해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await confirmPayment(order?.payment?.transactionId || orderId);
    } catch {
      setError("결제 기관 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main id="main-content" className={styles.page}>
      <Link className={styles.secondary} href="/parent/orders">
        결제 내역으로
      </Link>
      <h1>{resultOnly ? "결제 처리 상태" : "수강 신청 확인"}</h1>
      <div className={styles.stack}>
        <ResourceState
          loading={resource.loading}
          error={resource.error}
          retry={() => void resource.reload()}
        />
        {order && (
          <>
            <CommercePanel
              title={resultOnly ? "서버가 확인한 주문" : "자녀와 수업 일정"}
            >
              <OrderSummary order={order} />
              {resultOnly && (
                <p className={styles.notice}>
                  결제 결과는 서버가 결제 기관에 확인한 기록을 기준으로
                  표시합니다. 확인 대기 중에는 결제가 완료되었다고 표시하지
                  않습니다.
                </p>
              )}
            </CommercePanel>
            {order.status === "paid" &&
              order.enrollment?.status === "active" && (
                <p className={styles.success} role="status">
                  결제 완료 · {order.studentName} 학생의 수강권이
                  발급되었습니다.
                </p>
              )}
            {order.status === "payment_exception" && (
              <p className={styles.error} role="alert">
                결제 확인 중 예외가 발생했습니다. 새 결제를 진행하지 말고 결제
                내역과 운영자 안내를 확인해 주세요.
              </p>
            )}
            {!resultOnly && (
              <>
                <OrderPolicy order={order} />
                <CommercePanel title="결제 확인">
                  <p className={styles.total}>{won(order.amountWon)}</p>
                  <p className={styles.muted}>총액 · 원화(KRW)</p>
                  {!readiness.configured && (
                    <p className={styles.notice}>
                      결제 서비스 설정이 필요합니다. 실제 결제는 비활성 상태이며
                      운영자가 테스트 결제 연결을 준비하고 있습니다.
                    </p>
                  )}
                  {readiness.configured && (
                    <p className={styles.notice}>
                      {readiness.provider === "fake"
                        ? "격리된 모의 결제 환경입니다. 실제 금액이 청구되지 않습니다."
                        : "결제 서비스 설정이 필요합니다."}
                    </p>
                  )}
                  {expired ? (
                    <>
                      <p className={styles.error} role="alert">
                        좌석 예약 시간이 지났습니다. 수업 상세에서 다시 신청해
                        주세요.
                      </p>
                      <Link
                        className={styles.secondary}
                        href={`/classes/${order.offeringId}`}
                        onClick={() =>
                          restartEnrollment(order.studentId, order.offeringId)
                        }
                      >
                        수업 다시 확인
                      </Link>
                    </>
                  ) : (
                    order.status === "pending_payment" && (
                      <p>
                        좌석 예약 만료: {dateTime(order.expiresAt)} (한국시간)
                      </p>
                    )
                  )}
                  {order.status === "pending_payment" && (
                    <form
                      className={styles.form}
                      onSubmit={start}
                      aria-busy={busy}
                    >
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(event) => setConsent(event.target.checked)}
                          disabled={busy || !payable}
                          required
                        />
                        <span>
                          {order.studentName} 학생의 수업 일정, 총액{" "}
                          {won(order.amountWon)}, 주문에 기록된 테스트 전용 환불
                          정책을 확인하고 동의합니다.
                        </span>
                      </label>
                      <button
                        className={styles.primary}
                        disabled={busy || !payable || !consent}
                      >
                        {busy ? "결제 처리 확인 중…" : "테스트 결제 준비"}
                      </button>
                    </form>
                  )}
                  {prepared?.checkout.kind === "test" &&
                    readiness.provider === "fake" &&
                    payable && (
                      <button
                        className={styles.primary}
                        disabled={busy || !consent}
                        onClick={() => void fakePay()}
                      >
                        {busy ? "확인 중…" : "모의 결제 실행 (실제 청구 없음)"}
                      </button>
                    )}
                </CommercePanel>
              </>
            )}
            <CommercePanel title="처리 상태 확인">
              <p>
                현재 상태: <strong>{stateLabel(order.status)}</strong>
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy || resource.loading}
                  onClick={() => void resource.reload()}
                >
                  주문 상태 새로고침
                </button>
                {readiness.provider === "fake" &&
                  readiness.configured &&
                  order.status === "pending_payment" && (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => void verify()}
                    >
                      결제 기관에 확인 요청
                    </button>
                  )}
                {!resultOnly && (
                  <Link
                    className={styles.secondary}
                    href={`/checkout/${order.id}/result`}
                  >
                    결과 상태 보기
                  </Link>
                )}
              </div>
            </CommercePanel>
          </>
        )}
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
      </div>
    </main>
  );
}
