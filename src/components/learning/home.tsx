"use client";

import Link from "next/link";
import { useState } from "react";
import {
  dateTime,
  LearningGate,
  learningApi,
  learningError,
  LearningPanel,
  LearningState,
  statusLabel,
  useLearningResource,
} from "./shared";
import type { LearningView } from "./shared";
import type { LearningListItem } from "./types";
import styles from "./learning.module.css";

function OfferingList({
  view,
  studentId,
}: {
  view: LearningView;
  studentId?: string;
}) {
  const params = new URLSearchParams({ view });
  if (studentId) params.set("studentId", studentId);
  const resource = useLearningResource<{
    items: LearningListItem[];
    nextCursor: string | null;
  }>(`/api/learning/offerings?${params}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function more() {
    if (!resource.value?.nextCursor || busy) return;
    setBusy(true);
    setError("");
    try {
      params.set("cursor", resource.value.nextCursor);
      const result = await learningApi<{
        items: LearningListItem[];
        nextCursor: string | null;
      }>(`/api/learning/offerings?${params}`);
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
      setError("수업을 더 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <LearningPanel
      title={
        view === "instructor"
          ? "담당 수업의 학습 관리"
          : "수강 중인 수업과 학습 기록"
      }
    >
      <LearningState {...resource} retry={() => void resource.reload()} />
      {resource.value?.items.length === 0 && (
        <div className={styles.empty}>
          <p>
            {view === "instructor"
              ? "배정된 수업이 없습니다. 학원 원장에게 담당 수업을 확인해 주세요."
              : "현재 조회할 수 있는 수강 기록이 없습니다."}
          </p>
          {view !== "instructor" && (
            <Link className={styles.secondary} href="/classes">
              공개 수업 찾기
            </Link>
          )}
        </div>
      )}
      <ul className={styles.list}>
        {resource.value?.items.map((item) => (
          <li key={item.id}>
            <div className={styles.row}>
              <div>
                <h3>{item.courseTitle}</h3>
                <p className={styles.muted}>{item.academyName}</p>
              </div>
              {item.enrollmentStatus && (
                <span className={styles.badge}>
                  {statusLabel(item.enrollmentStatus)}
                </span>
              )}
            </div>
            {item.nextSessionAt && (
              <p>다음 수업 · {dateTime(item.nextSessionAt)} (한국시간)</p>
            )}
            <Link
              className={styles.primary}
              href={
                view === "instructor"
                  ? `/instructor/classes/${item.id}`
                  : `/learn/classes/${item.id}${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`
              }
            >
              {view === "instructor"
                ? "출결·과제 관리"
                : view === "parent"
                  ? "출결·과제·피드백 확인"
                  : "수업 입장·과제 확인"}
            </Link>
          </li>
        ))}
      </ul>
      {resource.value?.nextCursor && (
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => void more()}
        >
          {busy ? "불러오는 중…" : "수업 더 보기"}
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
export function LearningHome({ view }: { view: "student" | "instructor" }) {
  return <LearningGate>{() => <OfferingList view={view} />}</LearningGate>;
}
function ChildLearning({ studentId }: { studentId: string }) {
  const summary = useLearningResource<{
    attendanceCount: number;
    pendingAssignments: number;
    lateSubmissions?: number;
  }>(`/api/learning/summary?studentId=${encodeURIComponent(studentId)}`);
  return (
    <>
      <LearningPanel title="자녀의 학습 현황">
        <LearningState {...summary} retry={() => void summary.reload()} />
        {summary.value && (
          <>
            <dl className={styles.facts}>
              <div>
                <dt>출석·지각 기록</dt>
                <dd>{summary.value.attendanceCount}회</dd>
              </div>
              <div>
                <dt>미제출 과제</dt>
                <dd>{summary.value.pendingAssignments}개</dd>
              </div>
              {summary.value.lateSubmissions !== undefined && (
                <div>
                  <dt>늦은 제출</dt>
                  <dd>{summary.value.lateSubmissions}개</dd>
                </div>
              )}
            </dl>
            <p className={styles.muted}>
              담당 강사가 기록한 출결과 실제 제출 내역을 기준으로 표시합니다.
            </p>
          </>
        )}
      </LearningPanel>
      <OfferingList view="parent" studentId={studentId} />
    </>
  );
}
export function ParentLearning({
  students: children,
  verified,
}: {
  students: { id: string; name: string }[];
  verified: boolean;
}) {
  const [selected, setSelected] = useState("");
  const studentId = children.some((child) => child.id === selected)
    ? selected
    : (children[0]?.id ?? "");
  return (
    <LearningGate>
      {() => (
        <>
          <LearningPanel title="확인할 자녀 선택">
            {!verified ? (
              <p className={styles.notice}>
                보호자 확인 후 현재 연결된 자녀의 학습 기록을 볼 수 있습니다.
              </p>
            ) : children.length === 0 ? (
              <p className={styles.empty}>
                현재 연결된 자녀가 없습니다. 자녀 관리에서 연결 상태를 확인해
                주세요.
              </p>
            ) : (
              <label className={styles.form}>
                학습 기록을 확인할 자녀
                <select
                  value={studentId}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className={styles.muted}>
              보호자는 출결·제출 이력·강사 피드백을 확인합니다. 과제 제출은 학생
              계정에서 진행합니다.
            </p>
          </LearningPanel>
          {verified && studentId && (
            <ChildLearning key={studentId} studentId={studentId} />
          )}
        </>
      )}
    </LearningGate>
  );
}
