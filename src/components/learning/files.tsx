"use client";

import { useRef, useState } from "react";
import { learningApi, learningError, statusLabel } from "./shared";
import type { Readiness } from "./shared";
import styles from "./learning.module.css";

export function Download({
  materialId,
  filename,
  studentId,
  assignmentId,
  disabled = false,
}: {
  materialId: string;
  filename: string;
  studentId?: string;
  assignmentId?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (studentId) params.set("studentId", studentId);
      if (assignmentId) params.set("assignmentId", assignmentId);
      const query = params.size ? `?${params}` : "";
      const result = await learningApi<{ url: string }>(
        `/api/materials/${materialId}/download${query}`,
      );
      if (!result.ok) setError(learningError(result.code));
      else window.open(result.value.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("파일을 열지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className={styles.secondary}
        disabled={disabled || busy}
        onClick={() => void download()}
      >
        {busy ? "파일 확인 중…" : `${filename} 다운로드`}
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function UploadFiles({
  offeringId,
  purpose,
  readiness,
  onUploaded,
  multiple = false,
  disabled = false,
  maxFiles = 5,
  onBusyChange,
}: {
  offeringId: string;
  purpose: "material" | "submission";
  readiness: Readiness;
  onUploaded: (file: {
    materialId: string;
    filename: string;
    scanStatus: string;
  }) => void;
  multiple?: boolean;
  disabled?: boolean;
  maxFiles?: number;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const lock = useRef(false);
  const configured =
    readiness.storageConfigured && readiness.scanningConfigured;
  async function upload(files: FileList | null, input: HTMLInputElement) {
    if (!files || lock.current) return;
    setError("");
    setStatus("");
    const selected = Array.from(files);
    if (
      selected.length > maxFiles ||
      selected.some(
        (file) =>
          file.size > 10 * 1024 * 1024 ||
          file.size === 0 ||
          !["application/pdf", "image/png", "image/jpeg"].includes(file.type),
      )
    ) {
      setError(
        `PDF·PNG·JPEG 파일을 ${maxFiles}개 이하, 각 10MB 이하로 선택해 주세요.`,
      );
      input.value = "";
      return;
    }
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try {
      let count = 0;
      let scanMessage = "";
      for (const file of selected) {
        const response = await fetch("/api/materials/upload", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-offering-id": offeringId,
            "x-purpose": purpose,
            "x-file-name": encodeURIComponent(file.name),
            "x-file-type": file.type,
          },
          body: file,
        });
        const result = (await response.json()) as
          | { ok: true; value: { materialId: string; scanStatus: string } }
          | { ok: false; code: string };
        if (!result.ok) {
          setError(learningError(result.code));
          break;
        }
        onUploaded({ ...result.value, filename: file.name });
        count++;
        if (result.value.scanStatus !== "clean")
          scanMessage = `${file.name} · ${statusLabel(result.value.scanStatus)}. 검사 완료 전에는 제출·다운로드할 수 없습니다.`;
      }
      if (count)
        setStatus(
          scanMessage ||
            `${count}개 파일 업로드를 처리했습니다. 안전 검사 결과를 확인해 주세요.`,
        );
    } catch {
      setError(
        "파일 업로드를 완료하지 못했습니다. 완료된 파일을 확인한 후 실패한 파일만 다시 선택해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
      input.value = "";
    }
  }
  return (
    <>
      <label>
        {purpose === "material" ? "수업 자료 파일" : "답안 첨부 파일 (선택)"}
        <input
          className={styles.fileInput}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          multiple={multiple}
          disabled={disabled || busy || !configured}
          onChange={(event) =>
            void upload(event.target.files, event.currentTarget)
          }
        />
      </label>
      <p className={styles.muted}>
        PDF·PNG·JPEG · 최대 5개, 각 10MB. 파일은 격리 후 안전 검사를 통과해야
        사용할 수 있습니다.
      </p>
      {!configured && (
        <p className={styles.notice}>
          비공개 저장소·안전 검사 연결이 준비되지 않아 파일 업로드를 사용할 수
          없습니다. 텍스트 과제는 제출할 수 있습니다.
        </p>
      )}
      {busy && (
        <p role="status">
          파일을 업로드하고 안전 검사 결과를 확인하는 중입니다…
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
