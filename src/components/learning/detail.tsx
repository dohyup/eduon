"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { requestKey, won } from "../commerce/shared";
import { Classroom } from "./classroom";
import { Assignments } from "./assignments";
import { Download, UploadFiles } from "./files";
import { LearningReviews } from "./reviews";
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
import type { LearningView, Readiness } from "./shared";
import type {
  AssignmentView,
  LearningDetailView,
  MaterialView,
  SubmissionView,
} from "./types";
import styles from "./learning.module.css";

function ReviewAndReenroll({
  detail,
  reload,
}: {
  detail: LearningDetailView;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const lock = useRef(false);
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !detail.enrollment) return;
    const data = new FormData(event.currentTarget);
    lock.current = true;
    setBusy("review");
    setError("");
    try {
      const result = await learningApi("/api/reviews", {
        enrollmentId: detail.enrollment.id,
        rating: Number(data.get("rating")),
        text: String(data.get("text")).trim(),
      });
      if (!result.ok) setError(learningError(result.code));
      else await reload();
    } catch {
      setError(
        "후기를 저장하지 못했습니다. 기존 후기 여부를 확인하고 다시 시도해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function reenroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !detail.enrollment) return;
    const data = new FormData(event.currentTarget);
    const payload = {
      enrollmentId: detail.enrollment.id,
      nextOfferingId: String(data.get("nextOfferingId")),
      consent: true,
    };
    lock.current = true;
    setBusy("reenroll");
    setError("");
    try {
      const result = await learningApi<{ orderId: string }>(
        "/api/reenrollment",
        {
          ...payload,
          requestKey: requestKey(`reenroll:${detail.enrollment.id}`, payload),
        },
      );
      if (!result.ok) setError(learningError(result.code));
      else router.push(`/checkout/${result.value.orderId}`);
    } catch {
      setError(
        "재수강 주문을 확인하지 못했습니다. 같은 수업으로 다시 시도하면 기존 요청을 확인합니다.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  if (detail.enrollment?.status !== "completed" || detail.role === "instructor")
    return null;
  return (
    <LearningPanel title="완료한 수업의 후기·재수강">
      {detail.review ? (
        <>
          <h3>내 수강 후기 · {detail.review.rating}점 / 5점</h3>
          <p className={styles.prewrap}>{detail.review.text}</p>
          {detail.review.hiddenAt && (
            <p className={styles.notice}>
              운영 검토로 공개 목록에서 숨김 처리된 후기입니다. 작성한 기록은
              보존됩니다.
            </p>
          )}
        </>
      ) : (
        <form className={styles.form} onSubmit={(event) => void review(event)}>
          <fieldset disabled={Boolean(busy)}>
            <label>
              수강 후기 평점
              <select name="rating" defaultValue="5">
                {[5, 4, 3, 2, 1].map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}점
                  </option>
                ))}
              </select>
            </label>
            <label>
              수강 후기
              <textarea name="text" required maxLength={2000} />
            </label>
            <p className={styles.muted}>
              완료한 수강권마다 후기 1개를 작성할 수 있습니다.
            </p>
            <button className={styles.primary}>
              {busy === "review" ? "후기 저장 중…" : "수강 후기 등록"}
            </button>
          </fieldset>
        </form>
      )}
      {detail.role === "parent" &&
        (detail.nextOfferings.length ? (
          <form
            className={`${styles.form} ${styles.summary}`}
            onSubmit={(event) => void reenroll(event)}
          >
            <label>
              재수강할 다음 수업
              <select
                name="nextOfferingId"
                disabled={Boolean(busy)}
                required
                onChange={() => setConsent(false)}
              >
                {detail.nextOfferings.map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {offering.title ?? detail.course.title} ·{" "}
                    {dateTime(offering.startsAt)} · {won(offering.priceWon)}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.muted}>
              {detail.student?.name} 학생의 새 수강 신청입니다. 현재
              가격·정원·일정을 다시 확인한 후 새 주문으로 결제합니다.
            </p>
            <p className={styles.notice}>
              테스트 전용 재수강 신청입니다. 새 수업의 현재 가격과 새 주문
              정책이 적용되며 실제 청구는 없습니다. 주문 확인 화면에서 판매
              학원·총액·취소 정책을 다시 확인하세요.
            </p>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                required
                disabled={Boolean(busy)}
              />
              선택한 자녀와 다음 수업의 현재 가격을 확인하고 새 주문 정책 적용에
              동의합니다.
            </label>
            <button
              className={styles.primary}
              disabled={Boolean(busy) || !consent}
            >
              {busy === "reenroll"
                ? "새 주문 확인 중…"
                : "선택한 다음 수업 재수강 신청"}
            </button>
          </form>
        ) : (
          <p className={styles.empty}>
            현재 신청할 수 있는 같은 과정의 다음 수업이 없습니다.
          </p>
        ))}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </LearningPanel>
  );
}
function DetailBody({
  offeringId,
  view,
  studentId,
  readiness,
}: {
  offeringId: string;
  view: LearningView;
  studentId?: string;
  readiness: Readiness;
}) {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [loadedStudents, setLoadedStudents] = useState<
    { id: string; name: string }[]
  >([]);
  const query = new URLSearchParams({ view });
  if (studentId) query.set("studentId", studentId);
  else if (selectedStudent) query.set("studentId", selectedStudent);
  const resource = useLearningResource<LearningDetailView>(
    `/api/learning/offerings/${offeringId}?${query}`,
  );
  const [moreBusy, setMoreBusy] = useState("");
  const [moreError, setMoreError] = useState("");
  async function more(kind: "roster" | "assignments" | "materials") {
    const detail = resource.value;
    if (!detail || moreBusy) return;
    const cursor =
      kind === "roster"
        ? detail.rosterNextCursor
        : kind === "assignments"
          ? detail.assignmentsNextCursor
          : detail.materialsNextCursor;
    if (!cursor) return;
    const params = new URLSearchParams({ cursor });
    const targetStudent = studentId || selectedStudent;
    if (targetStudent && kind !== "roster")
      params.set("studentId", targetStudent);
    if (kind !== "roster") params.set("offeringId", offeringId);
    setMoreBusy(kind);
    setMoreError("");
    try {
      const url =
        kind === "roster"
          ? `/api/learning/offerings/${offeringId}/students?${params}`
          : `/api/${kind}?${params}`;
      const result = await learningApi<{
        items: unknown[];
        nextCursor: string | null;
      }>(url);
      if (!result.ok) setMoreError(learningError(result.code));
      else {
        if (kind === "assignments") {
          result.value.items = await Promise.all(
            (result.value.items as AssignmentView[]).map(async (assignment) => {
              const historyQuery = new URLSearchParams();
              if (targetStudent) historyQuery.set("studentId", targetStudent);
              const history = await learningApi<{
                items: SubmissionView[];
                nextCursor: string | null;
              }>(
                `/api/assignments/${assignment.id}/submissions?${historyQuery}`,
              );
              if (!history.ok) throw new Error(history.code);
              return {
                ...assignment,
                submissions: history.value.items,
                submissionsNextCursor: history.value.nextCursor,
              };
            }),
          );
        }
        if (kind === "roster")
          setLoadedStudents((previous) => [
            ...new Map(
              [
                ...previous,
                ...(result.value.items as { id: string; name: string }[]),
              ].map((item) => [item.id, item]),
            ).values(),
          ]);
        resource.setValue((previous) => {
          if (!previous) return previous;
          if (kind === "roster")
            return {
              ...previous,
              roster: [
                ...new Map(
                  [
                    ...(previous.roster ?? []),
                    ...(result.value.items as { id: string; name: string }[]),
                  ].map((item) => [item.id, item]),
                ).values(),
              ],
              rosterNextCursor: result.value.nextCursor,
            };
          if (kind === "materials")
            return {
              ...previous,
              materials: [
                ...new Map(
                  [
                    ...previous.materials,
                    ...(result.value.items as MaterialView[]),
                  ].map((item) => [item.id, item]),
                ).values(),
              ],
              materialsNextCursor: result.value.nextCursor,
            };
          return {
            ...previous,
            assignments: [
              ...new Map(
                [
                  ...previous.assignments,
                  ...(result.value.items as AssignmentView[]),
                ].map((item) => [
                  item.id,
                  { ...item, submissions: item.submissions ?? [] },
                ]),
              ).values(),
            ],
            assignmentsNextCursor: result.value.nextCursor,
          };
        });
      }
    } catch {
      setMoreError("추가 학습 내역을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setMoreBusy("");
    }
  }
  const detail = resource.value
    ? {
        ...resource.value,
        roster: [
          ...new Map(
            [...resource.value.roster, ...loadedStudents].map((student) => [
              student.id,
              student,
            ]),
          ).values(),
        ],
      }
    : null;
  return (
    <>
      <LearningState {...resource} retry={() => void resource.reload()} />
      {detail && (
        <>
          <LearningPanel title={detail.course.title}>
            <p>{detail.academy.name}</p>
            {detail.student && (
              <p className={styles.student}>
                {detail.student.name} 학생의 학습 기록
              </p>
            )}
            {detail.enrollment && (
              <span className={styles.badge}>
                {statusLabel(detail.enrollment.status)}
              </span>
            )}
            {detail.role === "instructor" && (
              <>
                <p className={styles.muted}>
                  실제로 배정된 수업의 학생만 조회하고 출결·피드백을 기록할 수
                  있습니다.
                </p>
                <label className={styles.form}>
                  제출 기록을 확인할 학생
                  <select
                    value={selectedStudent}
                    onChange={(event) => setSelectedStudent(event.target.value)}
                  >
                    <option value="">현재 수강생 전체</option>
                    {detail.roster?.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                </label>
                {detail.rosterNextCursor && (
                  <button
                    className={styles.secondary}
                    disabled={Boolean(moreBusy)}
                    onClick={() => void more("roster")}
                  >
                    수강생 더 보기
                  </button>
                )}
              </>
            )}
          </LearningPanel>
          <Classroom
            detail={detail}
            readiness={readiness}
            reload={() => resource.reload()}
          />
          <LearningPanel title="수업 자료">
            {detail.role === "instructor" && (
              <div className={styles.form}>
                <UploadFiles
                  offeringId={offeringId}
                  purpose="material"
                  readiness={readiness}
                  multiple
                  onUploaded={() => void resource.reload()}
                />
              </div>
            )}
            {detail.materials.length === 0 && (
              <p className={styles.empty}>등록된 수업 자료가 없습니다.</p>
            )}
            <ul className={styles.list}>
              {detail.materials.map((material) => (
                <li key={material.id}>
                  <p>
                    <strong>{material.filename}</strong> ·{" "}
                    {(material.bytes / 1024).toFixed(1)}KB
                  </p>
                  <p>
                    <span className={styles.badge}>
                      {statusLabel(material.scanStatus)}
                    </span>
                  </p>
                  <Download
                    materialId={material.id}
                    filename={material.filename}
                    studentId={studentId || selectedStudent || undefined}
                    disabled={material.scanStatus !== "clean"}
                  />
                </li>
              ))}
            </ul>
            {detail.materialsNextCursor && (
              <button
                className={styles.secondary}
                disabled={Boolean(moreBusy)}
                onClick={() => void more("materials")}
              >
                자료 더 보기
              </button>
            )}
          </LearningPanel>
          <Assignments
            detail={detail}
            readiness={readiness}
            studentId={studentId || selectedStudent || undefined}
            reload={() => resource.reload()}
          />
          {detail.assignmentsNextCursor && (
            <button
              className={styles.secondary}
              disabled={Boolean(moreBusy)}
              onClick={() => void more("assignments")}
            >
              과제 더 보기
            </button>
          )}
          <ReviewAndReenroll detail={detail} reload={() => resource.reload()} />
          <LearningReviews offeringId={offeringId} />
        </>
      )}
      {moreError && (
        <p className={styles.error} role="alert">
          {moreError}
        </p>
      )}
    </>
  );
}
export function LearningDetail({
  offeringId,
  view,
  studentId,
}: {
  offeringId: string;
  view: LearningView;
  studentId?: string;
}) {
  return (
    <main id="main-content" className={`container ${styles.page}`}>
      <Link
        className={styles.back}
        href={
          view === "instructor"
            ? "/instructor"
            : view === "parent"
              ? "/parent/learning"
              : "/learn"
        }
      >
        ←{" "}
        {view === "instructor"
          ? "담당 수업"
          : view === "parent"
            ? "자녀 학습 현황"
            : "나의 배움"}
      </Link>
      <h1>
        {view === "instructor"
          ? "담당 수업 학습 관리"
          : view === "parent"
            ? "자녀 수업의 학습 기록"
            : "나의 수업 공간"}
      </h1>
      <LearningGate>
        {(readiness) => (
          <DetailBody
            offeringId={offeringId}
            view={view}
            studentId={studentId}
            readiness={readiness}
          />
        )}
      </LearningGate>
    </main>
  );
}
