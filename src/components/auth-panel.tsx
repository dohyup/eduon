"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [loginMethod, setLoginMethod] = useState<"password" | "otp">(
    "password",
  );
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const signupBlocked = mode === "signup" && !signupAllowed;

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setFailed(true);
        setMessage(
          result.code === "UNAUTHENTICATED"
            ? "아이디(또는 이메일)나 비밀번호가 일치하지 않습니다."
            : result.code === "RATE_LIMITED"
              ? "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요."
              : "로그인 처리를 완료하지 못했습니다. 입력 정보를 다시 확인해 주세요.",
        );
      } else {
        setMessage("로그인되었습니다. 관리자 페이지로 이동합니다…");
        router.push(result.value?.redirectPath || "/admin");
        router.refresh();
      }
    } catch {
      setFailed(true);
      setMessage("연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
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
          {mode === "login"
            ? "관리자 아이디/비밀번호 또는 이메일 보안 링크(OTP)로 로그인할 수 있습니다."
            : "이메일로 받은 보안 링크를 통해 로그인합니다."}
        </p>

        {mode === "login" && (
          <div className={styles.actions}>
            <button
              type="button"
              className={
                loginMethod === "password" ? styles.primary : styles.secondary
              }
              onClick={() => {
                setLoginMethod("password");
                setMessage("");
                setFailed(false);
              }}
            >
              아이디·비밀번호 로그인
            </button>
            <button
              type="button"
              className={
                loginMethod === "otp" ? styles.primary : styles.secondary
              }
              onClick={() => {
                setLoginMethod("otp");
                setMessage("");
                setFailed(false);
              }}
            >
              이메일 링크(OTP) 로그인
            </button>
          </div>
        )}

        {mode === "login" && loginMethod === "password" ? (
          <form onSubmit={submitPassword} className={styles.form}>
            <label htmlFor="auth-identifier">
              아이디 또는 이메일
              <input
                id="auth-identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                required
                maxLength={254}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="admin 또는 admin@eduon.kr"
                disabled={busy}
              />
            </label>
            <label htmlFor="auth-password">
              비밀번호
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호 입력"
                disabled={busy}
              />
            </label>
            <button className={styles.primary} disabled={busy}>
              {busy ? "로그인 중…" : "로그인"}
            </button>
          </form>
        ) : configured && !signupBlocked ? (
          <form onSubmit={submitOtp} className={styles.form}>
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
              이메일 OTP 링크 발송을 사용하려면 Supabase 환경변수 설정이
              필요합니다. 관리자는 상단의 「아이디·비밀번호 로그인」 탭을
              이용해 주세요.
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
