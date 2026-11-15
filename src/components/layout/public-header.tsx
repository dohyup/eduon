"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X, Video, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useId, useRef } from "react";
import { trapDialogFocus } from "../ui/focus";

export function Logo({ inverted = false }: { inverted?: boolean }) {
  const gradId = useId();
  return (
    <Link
      href="/"
      className={`brand ${inverted ? "brand-inverted" : ""}`}
      aria-label="EDUON 홈"
    >
      <span className="brand-mark" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 40 40"
          width="36"
          height="36"
          fill="none"
        >
          <rect width="40" height="40" rx="10" fill={`url(#${gradId})`} />
          <path d="M12 28L20 14L28 28L20 23L12 28Z" fill="#FFFFFF" />
          <circle cx="20" cy="14" r="3.5" fill="#60A5FA" />
          <circle cx="12" cy="28" r="3" fill="#93C5FD" />
          <circle cx="28" cy="28" r="3" fill="#93C5FD" />
          <path
            d="M14 26C16 22 24 22 26 26"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="20" cy="24" r="2" fill="#FFFFFF" />
          <defs>
            <linearGradient
              id={gradId}
              x1="0"
              y1="0"
              x2="40"
              y2="40"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="50%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#4F46E5" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className="brand-text">
        EDU<span className="brand-accent">ON</span>
      </span>
      <span className="brand-ko">배움이음터</span>
    </Link>
  );
}

export function PublicHeader({ demo = true }: { demo?: boolean }) {
  const p = usePathname();
  const menu = useRef<HTMLDialogElement>(null);
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Logo />
          <nav className="desktop-nav" aria-label="주 메뉴">
            <Link
              aria-current={p.startsWith("/classes") ? "page" : undefined}
              href="/classes"
            >
              수업 찾기
            </Link>
            <Link
              aria-current={p === "/teach" ? "page" : undefined}
              href="/teach"
            >
              학원 입점 안내
            </Link>
            <Link
              aria-current={
                p.startsWith("/learn") || p.startsWith("/parent")
                  ? "page"
                  : undefined
              }
              href={demo ? "/learn" : "/onboarding"}
            >
              내 배움터
            </Link>
          </nav>
          <div className="header-actions">
            <Link
              className="live-room-pill"
              href={demo ? "/learn/classes/math-1" : "/learn"}
            >
              <span className="live-pulse-dot" aria-hidden="true" />
              <Video size={14} />
              <span>실시간 강의실</span>
            </Link>
            <Link className="login-link" href="/login">
              로그인
            </Link>
            <Link
              className="button small secondary"
              href={demo ? "/parent" : "/onboarding"}
            >
              {demo ? "데모 체험" : "내 계정"}
              <ArrowUpRight size={16} />
            </Link>
            <button
              type="button"
              className="site-menu-button button secondary"
              aria-label="사이트 메뉴"
              onClick={() => menu.current?.showModal()}
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
        <dialog
          ref={menu}
          className="site-menu-drawer"
          aria-labelledby="site-menu-title"
          onKeyDown={trapDialogFocus}
        >
          <div className="row">
            <h2 id="site-menu-title">EDUON 메뉴</h2>
            <button
              className="button secondary"
              aria-label="메뉴 닫기"
              onClick={() => menu.current?.close()}
            >
              <X size={18} />
            </button>
          </div>
          <nav aria-label="모바일 사이트 메뉴">
            {[
              ["수업 찾기", "/classes"],
              ["학원 입점 안내", "/teach"],
              ["실시간 강의실", demo ? "/learn/classes/math-1" : "/learn"],
              ["로그인 안내", "/login"],
              [demo ? "역할별 데모" : "나의 공간", "/onboarding"],
            ].map(([name, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => menu.current?.close()}
              >
                {name}
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </nav>
        </dialog>
      </header>
      <div className="demo-bar">
        <div className="container">
          <span className="demo-dot" />
          {demo
            ? "데모 · 실제 결제 및 수강 불가"
            : "P2 개발 · 계정·학원 관리 · 실제 결제 및 수강 불가"}
          <span className="demo-extra">
            {demo
              ? "합성 데이터로 미리 만나는 배움이음터"
              : "인증·학원관리 연결 준비"}
          </span>
        </div>
      </div>
    </>
  );
}

export function Footer({ demo = true }: { demo?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand-col">
            <div className="footer-brand-row">
              <Logo inverted />
              <span className="footer-cert-badge">
                EDUON 공식인증 교육플랫폼
              </span>
            </div>
            <p className="footer-desc">
              검증된 명문 학원과 전문 강사진의 실시간 양방향 라이브 수업을 한눈에
              비교하고 안심 수강할 수 있는 스마트 배움이음터입니다.
            </p>
            <div className="footer-trust-chips">
              <span>
                <CheckCircle2 size={14} /> 교육청 인가 확인
              </span>
              <span>
                <ShieldCheck size={14} /> 에스크로 안심 결제
              </span>
              <span>
                <Video size={14} /> Zoom 웹 강의실 내장
              </span>
            </div>
          </div>
          <nav className="footer-links" aria-label="하단 메뉴">
            <Link href="/classes">수업 찾기</Link>
            <Link href="/teach">학원 입점 안내</Link>
            <Link href={demo ? "/learn/classes/math-1" : "/learn"}>
              실시간 강의실
            </Link>
            <Link href="/onboarding">{demo ? "역할별 데모" : "나의 공간"}</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© 2026 EDUON · 배움이음터 (EduMarket Academy Network)</span>
          <span>
            {demo
              ? "프로토타입 · 모든 학원·인물·수업은 가상입니다."
              : "P2 개발 단계 · 결제·온라인 수강 연동은 준비 중입니다."}
          </span>
        </div>
      </div>
    </footer>
  );
}
