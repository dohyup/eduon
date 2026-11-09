"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ArrowUpRight, Menu, X } from "lucide-react";
import { useRef } from "react";
import { trapDialogFocus } from "../ui/focus";
export function Logo() {
  return (
    <Link href="/" className="brand" aria-label="EDUON 홈">
      <span className="brand-mark">
        <BookOpen size={23} />
      </span>
      EDUON<span className="brand-ko">배움이음터</span>
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
          </nav>
          <div className="header-actions">
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
            : "P4 내부 검증 · 학습 운영 구현 · 실결제 미지원"}
          <span className="demo-extra">
            {demo
              ? "합성 데이터로 미리 만나는 배움이음터"
              : "외부 서비스 연결 준비 중"}
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
          <Logo />
          <nav className="footer-links" aria-label="하단 메뉴">
            <Link href="/classes">수업 찾기</Link>
            <Link href="/teach">학원 입점 안내</Link>
            <Link href="/onboarding">{demo ? "역할별 데모" : "나의 공간"}</Link>
          </nav>
        </div>
        <p>학원의 가능성과 아이의 배움을 잇습니다.</p>
        <div className="footer-bottom">
          <span>© 2026 EDUON · 배움이음터</span>
          <span>
            {demo
              ? "프로토타입 · 모든 학원·인물·수업은 가상입니다."
              : "P4 내부 검증 단계 · 실제 결제·화상·파일 서비스 연결은 준비 중입니다."}
          </span>
        </div>
      </div>
    </footer>
  );
}
