"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import styles from "./live-workspace.module.css";

export function AuthPanel({
  mode,
  configured,
  signupAllowed = false,
}: {
  mode: "login" | "signup";
  configured: boolean;
  signupAllowed?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const signupBlocked = mode === "signup" && !signupAllowed;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !configured || signupBlocked) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/auth/otp", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setFailed(true);
        setMessage(
          result.code === "UNAVAILABLE" ||
            result.code === "PROVIDER_UNAVAILABLE"
            ? "인증 서비스 설정을 확인할 수 없습니다. 운영자에게 문의해 주세요."
            : result.code === "RATE_LIMITED"
              ? "요청이 많습니다. 잠시 후 다시 시도해 주세요."
              : "로그인 메일을 요청하지 못했습니다. 이메일 주소와 연결 상태를 확인해 주세요.",
        );
      } else {
        setMessage(
          "로그인할 수 있는 주소라면 안내 메일이 발송됩니다. 받은편지함과 스팸함을 확인해 주세요. 링크는 본인만 사용해 주세요.",
        );
      }
    } catch {
      setFailed(true);
      setMessage(
        "연결에 실패했습니다. 입력한 이메일은 유지됩니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main-content" className="container">
      <section className={styles.auth}>
        <p className={styles.eyebrow}>WELCOME TO EDUON</p>
        <h1>
          {mode === "signup"
            ? "새로운 배움을 시작하세요"
            : "나의 배움을 이어가세요"}
        </h1>
        <p>
          이메일로 받은 보안 링크를 통해 로그인합니다. 비밀번호를 따로
          입력하거나 저장하지 않습니다.
        </p>
        {configured && !signupBlocked ? (
          <form onSubmit={submit} className={styles.form}>
            <label htmlFor="auth-email">
              이메일 주소
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={busy}
              />
            </label>
            <button className={styles.primary} disabled={busy}>
              {busy ? "안내 요청 중…" : "로그인 링크 받기"}
            </button>
            <p className={styles.note}>
              이메일 인증과 보호자 확인은 서로 다른 절차입니다. 자녀 프로필을
              등록하려면 운영자의 보호자 확인이 필요합니다.
            </p>
          </form>
        ) : configured && signupBlocked ? (
          <div className={styles.warning} role="status">
            <strong>신규 가입은 운영 정책 확정 후 제공됩니다</strong>
            <p>
              인증 서비스는 연결되어 있지만, 신규 가입과 개인정보 처리 정책이
              아직 확정되지 않았습니다. 현재 이메일을 입력하거나 새 계정을 만들
              수 없습니다. 기존 계정은 로그인 화면을 이용해 주세요.
            </p>
            <Link className={styles.manualLink} href="/login">
              기존 계정으로 로그인 →
            </Link>
          </div>
        ) : (
          <div className={styles.warning} role="status">
            <strong>인증 서비스 설정이 필요합니다</strong>
            <p>
              Supabase 인증 연결이 아직 준비되지 않았습니다. 현재 실제
              로그인·회원가입을 진행할 수 없습니다. 운영자가 인증 환경변수와
              메일 발송 설정을 확인해야 합니다.
            </p>
          </div>
        )}
        {message && (
          <p
            className={failed ? styles.error : styles.success}
            role={failed ? "alert" : "status"}
          >
            {message}
          </p>
        )}
        <div className={styles.authLinks}>
          <Link href="/classes">공개 수업 둘러보기 →</Link>
          <Link href={mode === "signup" ? "/login" : "/signup"}>
            {mode === "signup" ? "로그인 안내" : "가입 안내"}
          </Link>
        </div>
      </section>
    </main>
  );
}
