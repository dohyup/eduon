"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  CommercePanel,
  commerceApi,
  commerceError,
  dateTime,
  ResourceState,
  stateLabel,
  useCommerceResource,
  won,
} from "./shared";
import type { CommerceMe } from "./shared";
import styles from "./commerce.module.css";

type Page<T> = { items: T[]; nextCursor: string | null };
type Settlement = {
  id: string;
  orderId: string;
  academyId: string;
  academyName?: string;
  amountWon: number;
  kind: string;
  canPay?: boolean;
  payoutAmountWon?: number;
  externalReference?: string | null;
  originalEntryId?: string | null;
  createdAt: string;
};
type Exception = {
  id: string;
  orderId: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextRunAt?: string | null;
  refundId?: string | null;
  retryJobId?: string | null;
  canRetry?: boolean;
};
const kindLabel = (kind: string) =>
  kind === "academy_due" ? "학원 귀속" : stateLabel(kind);
function SettlementList({ academyId }: { academyId: string }) {
  const resource = useCommerceResource<Page<Settlement>>(
    `/api/settlements?academyId=${encodeURIComponent(academyId)}`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function more() {
    if (busy || !resource.value?.nextCursor) return;
    setBusy(true);
    setError("");
    try {
      const result = await commerceApi<Page<Settlement>>(
        `/api/settlements?${new URLSearchParams({ academyId, cursor: resource.value.nextCursor })}`,
      );
      if (!result.ok) setError(commerceError(result.code));
      else
        resource.setValue((previous) => ({
          items: [
            ...new Map(
              [...(previous?.items ?? []), ...result.value.items].map(
                (entry) => [entry.id, entry],
              ),
            ).values(),
          ],
          nextCursor: result.value.nextCursor,
        }));
    } catch {
      setError("추가 정산 내역을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        retry={() => void resource.reload()}
      />
      {resource.value?.items.length === 0 && (
        <p>이 학원의 정산 기록이 없습니다.</p>
      )}
      <ul className={styles.list}>
        {resource.value?.items.map((entry) => (
          <li key={entry.id} className={styles.item}>
            <div className={styles.row}>
              <h3>{kindLabel(entry.kind)}</h3>
              <strong>{won(entry.amountWon)}</strong>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>기록 시각</dt>
                <dd>{dateTime(entry.createdAt)} (한국시간)</dd>
              </div>
              <div>
                <dt>주문 번호</dt>
                <dd>{entry.orderId}</dd>
              </div>
              {entry.externalReference && (
                <div>
                  <dt>외부 송금 참조</dt>
                  <dd>{entry.externalReference}</dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
      {resource.value?.nextCursor && (
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => void more()}
        >
          {busy ? "불러오는 중…" : "정산 기록 더 보기"}
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function AcademyFinance({
  memberships,
}: {
  memberships: CommerceMe["memberships"];
}) {
  const owned = memberships.filter((membership) => membership.role === "owner");
  const [selected, setSelected] = useState("");
  const academyId = owned.some((item) => item.academy.id === selected)
    ? selected
    : owned[0]?.academy.id;
  return (
    <CommercePanel title="학원 정산 기록">
      <p>
        결제, 환불, 수수료와 외부 지급은 원거래를 보존한 별도 기록으로
        표시됩니다. 표시 금액의 단순 합계가 지급 가능액을 뜻하지는 않습니다.
      </p>
      {owned.length ? (
        <>
          <div className={styles.form}>
            <label>
              조회할 학원
              <select
                value={academyId}
                onChange={(event) => setSelected(event.target.value)}
              >
                {owned.map((item) => (
                  <option key={item.academy.id} value={item.academy.id}>
                    {item.academy.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {academyId && (
            <SettlementList key={academyId} academyId={academyId} />
          )}
        </>
      ) : (
        <p className={styles.notice}>
          원장으로 연결된 학원이 없습니다. 학원 소속을 확인해 주세요.
        </p>
      )}
    </CommercePanel>
  );
}
function PayoutRecord({ updated }: { updated: () => Promise<void> }) {
  const entries = useCommerceResource<Page<Settlement>>("/api/settlements");
  const [loadingMore, setLoadingMore] = useState(false);
  const [entryId, setEntryId] = useState("");
  const [reference, setReference] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function moreEntries() {
    if (loadingMore || !entries.value?.nextCursor) return;
    setLoadingMore(true);
    setError("");
    try {
      const result = await commerceApi<Page<Settlement>>(
        `/api/settlements?cursor=${encodeURIComponent(entries.value.nextCursor)}`,
      );
      if (!result.ok) setError(commerceError(result.code));
      else
        entries.setValue((previous) => ({
          items: [
            ...new Map(
              [...(previous?.items ?? []), ...result.value.items].map(
                (entry) => [entry.id, entry],
              ),
            ).values(),
          ],
          nextCursor: result.value.nextCursor,
        }));
    } catch {
      setError("정산 항목을 추가로 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setLoadingMore(false);
    }
  }
  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      lock.current ||
      !checked ||
      !entries.value?.items.some(
        (entry) => entry.id === entryId && entry.canPay,
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await commerceApi<unknown>(
        `/api/settlements/${encodeURIComponent(entryId.trim())}/paid`,
        { externalReference: reference.trim() },
      );
      if (!result.ok) setError(commerceError(result.code));
      else {
        setMessage("외부 송금 참조를 별도 지급 기록으로 남겼습니다.");
        setChecked(false);
        await updated();
        await entries.reload();
      }
    } catch {
      setError(
        "기록 결과를 확인하지 못했습니다. 같은 송금 참조로 재확인해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className={styles.item}>
      <summary>확인된 외부 송금 기록</summary>
      <p>
        외부에서 완료한 송금의 참조를 기록합니다. 이 화면에서 송금을 실행하지
        않습니다. 원장의 지급 기록과 확인한 정산 항목을 대조해 주세요.
      </p>
      <ResourceState
        loading={entries.loading}
        error={entries.error}
        retry={() => void entries.reload()}
      />
      {entries.value?.nextCursor && (
        <button
          type="button"
          className={styles.secondary}
          disabled={busy || loadingMore}
          onClick={() => void moreEntries()}
        >
          {loadingMore ? "불러오는 중…" : "정산 항목 더 불러오기"}
        </button>
      )}
      <form className={styles.form} onSubmit={record} aria-busy={busy}>
        <label>
          지급할 학원 귀속 정산 항목
          <select
            value={entryId}
            onChange={(event) => {
              setEntryId(event.target.value);
              setChecked(false);
            }}
            disabled={busy || entries.loading}
            required
          >
            <option value="">정산 항목 선택</option>
            {entries.value?.items
              .filter((entry) => entry.canPay)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.academyName || "학원"} · 지급{" "}
                  {won(entry.payoutAmountWon ?? entry.amountWon)} · 주문{" "}
                  {entry.orderId}
                </option>
              ))}
          </select>
        </label>
        {entries.value?.items.filter((entry) => entry.canPay).length === 0 && (
          <p>현재 조회된 기록에 지급 가능한 학원 귀속 항목이 없습니다.</p>
        )}
        <label>
          외부 송금 참조
          <input
            value={reference}
            onChange={(event) => {
              setReference(event.target.value);
              setChecked(false);
            }}
            disabled={busy}
            required
            maxLength={200}
            autoComplete="off"
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={checked}
            disabled={busy}
            onChange={(event) => setChecked(event.target.checked)}
            required
          />
          <span>
            송금이 완료되었고, 해당 학원과 금액을 정산 항목에 대조했습니다.
          </span>
        </label>
        <button
          className={styles.primary}
          disabled={busy || !checked || !entryId.trim() || !reference.trim()}
        >
          {busy ? "기록 중…" : "지급 기록 남기기"}
        </button>
      </form>
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
    </details>
  );
}
export function AdminPayments() {
  const resource = useCommerceResource<Page<Exception>>(
    "/api/payments/exceptions",
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function retry(exception: Exception) {
    const target = exception.retryJobId
      ? `/api/jobs/${encodeURIComponent(exception.retryJobId)}/retry`
      : exception.refundId
        ? `/api/refunds/${encodeURIComponent(exception.refundId)}/retry`
        : null;
    if (lock.current || !exception.canRetry || !target) return;
    lock.current = true;
    setBusy(exception.id);
    setError("");
    setMessage("");
    try {
      const result = await commerceApi<unknown>(target, {});
      if (!result.ok) setError(commerceError(result.code));
      else {
        setMessage(
          "기존 거래 작업의 재처리를 예약했습니다. 완료 여부는 서버 처리 결과를 다시 확인해 주세요.",
        );
        await resource.reload();
      }
    } catch {
      setError(
        "재처리 결과를 확인하지 못했습니다. 처리 상태를 새로 확인해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function more() {
    if (busy || !resource.value?.nextCursor) return;
    setBusy("more");
    setError("");
    try {
      const result = await commerceApi<Page<Exception>>(
        `/api/payments/exceptions?cursor=${encodeURIComponent(resource.value.nextCursor)}`,
      );
      if (!result.ok) setError(commerceError(result.code));
      else
        resource.setValue((previous) => ({
          items: [
            ...new Map(
              [...(previous?.items ?? []), ...result.value.items].map(
                (entry) => [entry.id, entry],
              ),
            ).values(),
          ],
          nextCursor: result.value.nextCursor,
        }));
    } catch {
      setError("추가 예외 내역을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }
  return (
    <CommercePanel title="결제·환불 예외 처리">
      <p>
        결제 확인 지연과 실패한 작업을 확인하세요. 재처리 접수는 환불 완료를
        의미하지 않습니다.
      </p>
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        retry={() => void resource.reload()}
      />
      {resource.value?.items.length === 0 && (
        <p>현재 확인할 결제·환불 예외가 없습니다.</p>
      )}
      <ul className={styles.list}>
        {resource.value?.items.map((exception) => (
          <li className={styles.item} key={exception.id}>
            <div className={styles.row}>
              <h3>
                {exception.refundId ? "환불 처리 확인" : "거래 처리 확인"}
              </h3>
              <span className={styles.badge}>
                {stateLabel(exception.status)}
              </span>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>주문 번호</dt>
                <dd>{exception.orderId || "주문 연결 확인 필요"}</dd>
              </div>
              <div>
                <dt>처리 시도</dt>
                <dd>{exception.attempts}회</dd>
              </div>
              {exception.nextRunAt && (
                <div>
                  <dt>다음 처리</dt>
                  <dd>{dateTime(exception.nextRunAt)}</dd>
                </div>
              )}
            </dl>
            {exception.lastError && (
              <p className={styles.error}>오류 코드: {exception.lastError}</p>
            )}
            {exception.canRetry &&
              (exception.retryJobId || exception.refundId) && (
                <button
                  className={styles.secondary}
                  disabled={Boolean(busy)}
                  onClick={() => void retry(exception)}
                >
                  {busy === exception.id
                    ? "재처리 요청 중…"
                    : exception.retryJobId
                      ? "거래 작업 재처리"
                      : "기존 환불 요청 재처리"}
                </button>
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
          {busy === "more" ? "불러오는 중…" : "예외 내역 더 보기"}
        </button>
      )}
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
      <PayoutRecord updated={() => resource.reload()} />
    </CommercePanel>
  );
}
