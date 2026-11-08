"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useRef } from "react";
import type { ReactNode } from "react";
import { roleInfo, type WorkspaceRole } from "../../demo/workspaces";
import { trapDialogFocus } from "../ui/focus";
import styles from "../workspace.module.css";

export function WorkspaceShell({
  role,
  children,
}: {
  role: WorkspaceRole;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const info = roleInfo[role];
  const menu = useRef<HTMLDialogElement>(null);
  const menuTitleId = useId();
  return (
    <main id="main-content" className={`container ${styles.workspace}`}>
      <div className={styles.workspaceTop}>
        <p className={styles.breadcrumb}>
          나의 EDUON <span aria-hidden="true">/</span> {info.name} 공간
        </p>
        <label className={styles.rolePicker}>
          체험할 역할
          <select
            value={role}
            onChange={(event) =>
              router.push(roleInfo[event.target.value as WorkspaceRole].root)
            }
          >
            {Object.entries(roleInfo).map(([key, value]) => (
              <option key={key} value={key}>
                {value.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <button
            type="button"
            className={`${styles.action} ${styles.secondary} ${styles.mobileMenu}`}
            aria-haspopup="dialog"
            onClick={() => menu.current?.showModal()}
          >
            메뉴 <span aria-hidden="true">☰</span>
          </button>
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              {role === "parent" ? "P" : role === "student" ? "S" : "E"}
            </span>
            <div>
              <strong>{info.name} 체험 공간</strong>
              <small>합성 데이터 · 데모 계정</small>
            </div>
          </div>
          <nav className={styles.desktopNav} aria-label={`${info.name} 메뉴`}>
            {info.nav.map(([name, href]) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
              >
                {name}
                <span aria-hidden="true">↗</span>
              </Link>
            ))}
          </nav>
          <div className={styles.sidebarNote}>
            <strong>배움이 이어지는 곳</strong>
            <p>
              지역의 좋은 수업을
              <br />
              우리 아이의 일상으로.
            </p>
            <Link href="/classes">새로운 수업 찾기 →</Link>
          </div>
        </aside>
        <dialog
          ref={menu}
          className={styles.menuDrawer}
          aria-labelledby={menuTitleId}
          onKeyDown={trapDialogFocus}
        >
          <div className={styles.row}>
            <h2 id={menuTitleId}>{info.name} 메뉴</h2>
            <form method="dialog">
              <button className={`${styles.action} ${styles.secondary}`}>
                메뉴 닫기
              </button>
            </form>
          </div>
          <p className={styles.note}>합성 데이터로 체험하는 데모 공간입니다.</p>
          <nav aria-label="모바일 업무 메뉴">
            {info.nav.map(([name, href]) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                onClick={() => menu.current?.close()}
              >
                {name}
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </nav>
        </dialog>
        <div className={styles.body}>{children}</div>
      </div>
    </main>
  );
}
