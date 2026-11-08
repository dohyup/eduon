"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  CommercePanel,
  commerceApi,
  commerceError,
  dateTime,
  requestKey,
  ResourceState,
  stateLabel,
  useCommerceResource,
  won,
} from "./shared";
import styles from "./commerce.module.css";

export type OrderView = {
  id: string;
  studentId: string;
  studentName: string;
  offeringId: string;
  courseTitle: string;
  academyId: string;
  academyName: string;
  amountWon: number;
  status: string;
  policyVersion: string;
  expiresAt: string;
  consentedAt: string | null;
  policySnapshot: {
    version: string;
    currency: string;
    livePaymentsEnabled: boolean;
    reservationMinutes: number;
    fee: { kind: string; basisPoints: number };
    refundRule: string;
    relationship: string;
    sellerAcademyId: string;
  };
  sessions: {
    sessionId: string;
    startsAt: string;
    endsAt: string;
    amountWon: number;
  }[];
  enrollment: null | {
    id: string;
    status: string;
    sessions: {
      id: string;
      sessionId: string;
      status: string;
      startsAt: string;
      endsAt: string;
      amountWon: number;
      completedAt?: string | null;
    }[];
  };
  refunds: {
    id: string;
    status: string;
    amountWon: number;
    reason: string;
    createdAt: string;
  }[];
  payment?: { transactionId: string; status: string } | null;
};
export function OrderSummary({ order }: { order: OrderView }) {
  return (
    <>
      <div className={styles.row}>
        <div>
          <h3>{order.courseTitle}</h3>
          <p className={styles.muted}>{order.academyName}</p>
        </div>
        <span className={styles.badge}>{stateLabel(order.status)}</span>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>수강 자녀</dt>
          <dd>{order.studentName}</dd>
        </div>
        <div>
          <dt>총 결제 금액</dt>
          <dd>
            <strong>{won(order.amountWon)}</strong> · KRW
          </dd>
        </div>
        <div>
          <dt>주문 번호</dt>
          <dd>{order.id}</dd>
        </div>
      </dl>
      <ul className={styles.list}>
        {order.sessions.map((session, index) => {
          const right = order.enrollment?.sessions.find(
            (item) => item.sessionId === session.sessionId,
          );
          return (
            <li className={styles.session} key={session.sessionId}>
              <strong>
                {index + 1}회차 · {dateTime(session.startsAt)}
              </strong>
              <div className={styles.row}>
                <span className={styles.muted}>
                  한국시간 · {won(session.amountWon)}
                </span>
                {right && (
                  <span className={styles.badge}>
                    {stateLabel(right.status)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
export function OrderPolicy({ order }: { order: OrderView }) {
  return (
    <section className={styles.notice}>
      <h3>주문에 기록된 정책</h3>
      <p>
        테스트 전용 · {order.policyVersion}. 운영 결제 정책이 확정되기 전에는
        실제 결제를 제공하지 않습니다.
      </p>
      <p>
        판매자: {order.academyName} · 원화(KRW) · 테스트 수수료{" "}
        {order.policySnapshot.fee.basisPoints / 100}% · 확인된 보호자와 연결된
        자녀만 신청 가능 · 좌석 예약 {order.policySnapshot.reservationMinutes}분
      </p>
      <p>
        시작 전이며 이수하지 않은 회차만 해당 회차에 배정된 금액으로 환불을
        요청할 수 있습니다. 요청 후 해당 회차 입장은 일시 중지되며, 결제 기관의
        확인 후 환불 완료로 변경됩니다. 실패 시 정책상 유효한 입장이 복원됩니다.
      </p>
    </section>
  );
}
function RefundForm({
  order,
  updated,
}: {
  order: OrderView;
  updated: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const [now] = useState(() => Date.now());
  const sessions =
    order.enrollment?.sessions.filter(
      (session) =>
        session.status === "allowed" &&
        !session.completedAt &&
        new Date(session.startsAt).getTime() > now,
    ) ?? [];
  async function refund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !selected.length || !reason.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        cancelSessionIds: [...selected].sort(),
        reason: reason.trim(),
      };
      const result = await commerceApi<{ refundId: string }>(
        `/api/orders/${order.id}/refunds`,
        { ...payload, requestKey: requestKey(`refund:${order.id}`, payload) },
      );
      if (!result.ok) setError(commerceError(result.code));
      else {
        setMessage(
          "취소 요청이 접수되었습니다. 해당 회차는 처리 중이며 환불 완료 여부는 아래 내역에서 확인해 주세요.",
        );
        setSelected([]);
        await updated();
      }
    } catch {
      setError(
        "요청 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도하면 기존 요청을 확인합니다.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {order.refunds.length > 0 && (
        <div className={styles.item}>
          <h3>취소·환불 처리 내역</h3>
          <ul className={styles.list}>
            {order.refunds.map((refund) => (
              <li className={styles.item} key={refund.id}>
                <div className={styles.row}>
                  <strong>{won(refund.amountWon)}</strong>
                  <span className={styles.badge}>
                    {["requested", "processing", "pending"].includes(
                      refund.status,
                    )
                      ? "취소 처리 중"
                      : refund.status === "succeeded"
                        ? "환불 완료"
                        : stateLabel(refund.status)}
                  </span>
                </div>
                <p>{refund.reason}</p>
                <p className={styles.muted}>
                  {dateTime(refund.createdAt)} · {refund.id}
                </p>
                {refund.status === "failed" && (
                  <p className={styles.error}>
                    환불을 완료하지 못했습니다. 기존 수강 권리를 확인하고
                    운영자에게 재처리를 문의해 주세요.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sessions.length > 0 && (
        <details className={styles.item}>
          <summary>회차 선택하여 취소·환불 요청</summary>
          <form className={styles.form} onSubmit={refund} aria-busy={busy}>
            <fieldset disabled={busy}>
              <legend>취소할 회차</legend>
              {sessions.map((session) => (
                <label key={session.sessionId} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={selected.includes(session.sessionId)}
                    onChange={(event) =>
                      setSelected((previous) =>
                        event.target.checked
                          ? [...previous, session.sessionId]
                          : previous.filter((id) => id !== session.sessionId),
                      )
                    }
                  />
                  <span>
                    {dateTime(session.startsAt)} · {won(session.amountWon)}
                  </span>
                </label>
              ))}
            </fieldset>
            <label>
              취소 사유
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                maxLength={1000}
                disabled={busy}
              />
            </label>
            <p>
              선택한 {selected.length}회차의 환불 요청 금액:{" "}
              <strong>
                {won(
                  sessions
                    .filter((session) => selected.includes(session.sessionId))
                    .reduce((sum, session) => sum + session.amountWon, 0),
                )}
              </strong>
              . 최종 가능 여부와 금액은 서버가 주문 정책으로 확인합니다.
            </p>
            <p className={styles.muted}>
              요청 시 선택한 회차의 입장이 일시 중지됩니다. 다른 회차는
              유지됩니다.
            </p>
            <button
              className={styles.danger}
              disabled={busy || !selected.length || !reason.trim()}
            >
              {busy
                ? "취소 요청 중…"
                : `${order.studentName} 학생의 선택 회차 취소 요청`}
            </button>
          </form>
        </details>
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
    </>
  );
}
export function ParentOrders() {
  const resource = useCommerceResource<{
    items: OrderView[];
    nextCursor: string | null;
  }>("/api/orders");
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  async function more() {
    if (!resource.value?.nextCursor || moreBusy) return;
    setMoreBusy(true);
    setMoreError("");
    try {
      const result = await commerceApi<{
        items: OrderView[];
        nextCursor: string | null;
      }>(`/api/orders?cursor=${encodeURIComponent(resource.value.nextCursor)}`);
      if (!result.ok) setMoreError(commerceError(result.code));
      else {
        resource.setValue((previous) => ({
          items: [
            ...new Map(
              [...(previous?.items ?? []), ...result.value.items].map(
                (order) => [order.id, order],
              ),
            ).values(),
          ],
          nextCursor: result.value.nextCursor,
        }));
      }
    } catch {
      setMoreError("추가 내역을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setMoreBusy(false);
    }
  }
  return (
    <div className={styles.stack}>
      <CommercePanel title="결제·취소 내역">
        <p>연결된 자녀의 주문과 회차별 수강 권리를 확인하세요.</p>
        <ResourceState
          loading={resource.loading}
          error={resource.error}
          retry={() => void resource.reload()}
        />
        {resource.value?.items.length === 0 && (
          <>
            <p>신청한 수업이 없습니다.</p>
            <Link className={styles.primary} href="/classes">
              수업 찾기
            </Link>
          </>
        )}
      </CommercePanel>
      {resource.value?.items.map((order) => (
        <CommercePanel
          title={`${order.studentName} 학생의 주문`}
          key={order.id}
        >
          <OrderSummary order={order} />
          {order.status === "pending_payment" && (
            <div className={styles.actions}>
              <Link className={styles.primary} href={`/checkout/${order.id}`}>
                주문 확인·결제
              </Link>
              <span className={styles.muted}>
                예약 만료: {dateTime(order.expiresAt)}
              </span>
            </div>
          )}
          <RefundForm order={order} updated={() => resource.reload()} />
        </CommercePanel>
      ))}
      {resource.value?.nextCursor && (
        <button
          className={styles.secondary}
          disabled={moreBusy}
          onClick={() => void more()}
        >
          {moreBusy ? "불러오는 중…" : "주문 더 보기"}
        </button>
      )}
      {moreError && (
        <p className={styles.error} role="alert">
          {moreError}
        </p>
      )}
    </div>
  );
}
