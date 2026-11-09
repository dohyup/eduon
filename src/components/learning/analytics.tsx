"use client";
import { useState } from "react";
import {
  LearningGate,
  LearningPanel,
  LearningState,
  useLearningResource,
} from "./shared";
import styles from "./learning.module.css";
const labels: Record<string, string> = {
  search: "검색",
  detail: "상세 확인",
  application: "수강 신청",
  paid: "결제 확인",
  first_participation: "첫 참여",
  reenrollment: "재수강 신청",
};
function Counts({ academyId }: { academyId?: string }) {
  const resource = useLearningResource<{
    scope: string;
    counts: { stage: string; count: number }[];
  }>(
    `/api/analytics${academyId ? `?academyId=${encodeURIComponent(academyId)}` : ""}`,
  );
  return (
    <>
      <LearningState {...resource} retry={() => void resource.reload()} />
      {resource.value && (
        <>
          <dl className={styles.facts}>
            {Object.entries(labels).map(([stage, label]) => (
              <div key={stage}>
                <dt>{label}</dt>
                <dd>
                  {resource.value!.counts.find((item) => item.stage === stage)
                    ?.count ?? 0}
                  건
                </dd>
              </div>
            ))}
          </dl>
          <p className={styles.muted}>
            기록된 전환 이벤트의 중복을 제거한 건수입니다. 검색·상세는 로그인한
            사용자의 실제 화면 노출을 기준으로 합니다. 학생 이름이나 제출 내용은
            집계에 포함하지 않습니다. 검색·상세 조회 기록이 수집되지 않았다면
            0건으로 표시됩니다.
          </p>
        </>
      )}
    </>
  );
}
export function LearningAnalytics({
  academies,
  platform = false,
}: {
  academies?: { id: string; name: string }[];
  platform?: boolean;
}) {
  const [selected, setSelected] = useState("");
  const academyId = academies?.some((item) => item.id === selected)
    ? selected
    : academies?.[0]?.id;
  return (
    <LearningGate>
      {() => (
        <LearningPanel
          title={platform ? "플랫폼 학습 전환 현황" : "학원 학습 전환 현황"}
        >
          {!platform && academies?.length ? (
            <label className={styles.form}>
              지표를 확인할 학원
              <select
                value={academyId}
                onChange={(event) => setSelected(event.target.value)}
              >
                {academies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {platform || academyId ? (
            <Counts key={academyId ?? "platform"} academyId={academyId} />
          ) : (
            <p className={styles.empty}>현재 관리할 수 있는 학원이 없습니다.</p>
          )}
        </LearningPanel>
      )}
    </LearningGate>
  );
}
