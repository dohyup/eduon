"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import styles from "./live-workspace.module.css";
import { ParentOrders } from "./commerce/orders";
import { AcademyFinance, AdminPayments } from "./commerce/finance";

type Role = "parent" | "student" | "owner" | "instructor" | "admin";
type Result<T> =
  | { ok: true; value: T; nextCursor?: string | null }
  | { ok: false; code: string };
type Academy = { id: string; name: string; status: string; region?: string };
type Child = {
  id: string;
  name: string;
  grade: number;
  accountUserId: string | null;
};
type Me = {
  user: {
    id: string;
    email: string;
    platformAdmin: boolean;
    guardianVerifiedAt: string | null;
  };
  memberships: { academy: Academy; role: string }[];
  instructors?: {
    academyId: string;
    userId: string;
    email: string;
    role: string;
  }[];
  children: Child[];
  student: { id: string; name: string; grade: number } | null;
};
type Offering = {
  id: string;
  academyId: string;
  status: string;
  priceWon: number;
  capacity: number;
  course: {
    title: string;
    subject: string;
    gradeMin: number;
    gradeMax: number;
    level: string;
  };
  sessions: { startsAt: string; endsAt: string }[];
  instructors: { userId: string }[];
};
type Invite = { inviteUrl?: string; delivery?: "sent" | "manual" | "failed" };
const info: Record<
  Role,
  { name: string; title: string; description: string; nav: [string, string][] }
> = {
  parent: {
    name: "학부모",
    title: "아이의 배움을 함께 연결해요",
    description:
      "확인된 보호자 관계를 기반으로 자녀 프로필과 계정을 관리합니다.",
    nav: [
      ["학부모 홈", "/parent"],
      ["자녀 관리", "/parent/children"],
      ["결제 내역", "/parent/orders"],
    ],
  },
  student: {
    name: "학생",
    title: "나의 배움이 시작되는 곳",
    description: "보호자에게 받은 초대로 학생 계정을 연결할 수 있습니다.",
    nav: [["나의 배움", "/learn"]],
  },
  owner: {
    name: "학원 원장",
    title: "학원의 새로운 배움을 준비하세요",
    description: "입점 신청부터 수업 개설과 공개까지 한곳에서 관리합니다.",
    nav: [
      ["운영 현황", "/academy"],
      ["수업 관리", "/academy/classes"],
      ["수강생 관리", "/academy/students"],
      ["정산 내역", "/academy/finance"],
    ],
  },
  instructor: {
    name: "강사",
    title: "함께 만들어 가는 배움",
    description: "소속 학원에서 배정한 수업을 확인하세요.",
    nav: [["담당 수업", "/instructor"]],
  },
  admin: {
    name: "운영자",
    title: "신뢰할 수 있는 배움을 연결해요",
    description: "학원 입점과 보호자 확인을 실제 기록으로 관리합니다.",
    nav: [
      ["운영 현황", "/admin"],
      ["학원 심사", "/admin/academies"],
      ["거래 관리", "/admin/payments"],
    ],
  },
};
const messages: Record<string, string> = {
  UNAUTHENTICATED: "로그인이 필요합니다. 로그인한 뒤 다시 시도해 주세요.",
  FORBIDDEN:
    "이 작업을 수행할 권한이 없습니다. 계정의 소속과 확인 상태를 확인해 주세요.",
  NOT_FOUND: "요청한 내역을 찾을 수 없거나 접근할 수 없습니다.",
  VALIDATION:
    "입력 내용을 확인해 주세요. 학년·가격·일정과 필수 항목을 다시 확인해 주세요.",
  CONFLICT:
    "현재 상태에서는 처리할 수 없습니다. 중복 등록, 만료, 수업 일정 충돌 여부를 확인해 주세요.",
  EXPIRED: "초대 또는 요청의 유효기간이 지났습니다. 새 초대를 요청해 주세요.",
  RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  UNAVAILABLE: "서비스 연결이 준비되지 않았습니다. 운영자에게 문의해 주세요.",
  PROVIDER_UNAVAILABLE:
    "외부 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
const errorMessage = (code: string) =>
  messages[code] ??
  "요청을 처리하지 못했습니다. 입력값은 유지됩니다. 잠시 후 다시 시도해 주세요.";
const statusText: Record<string, string> = {
  draft: "초안",
  submitted: "심사 중",
  approved: "승인",
  rejected: "반려",
  suspended: "정지",
  published: "공개",
  closed: "모집 종료",
  completed: "완료",
  cancelled: "취소",
};
const gradeText = (grade: number) =>
  grade <= 6
    ? `초등 ${grade}학년`
    : grade <= 9
      ? `중등 ${grade - 6}학년`
      : `고등 ${grade - 9}학년`;
async function api<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Result<T>> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const result = (await response.json()) as Result<T>;
  if (!response.ok && result.ok) return { ok: false, code: "UNAVAILABLE" };
  return result;
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function InvitationAccept({
  kind,
  token = "",
}: {
  kind: "student" | "instructor";
  token?: string;
}) {
  const [value, setValue] = useState(token);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await api<unknown>(
        kind === "student"
          ? "/api/guardian-invitations/accept"
          : "/api/instructor-invitations/accept",
        { token: value.trim() },
      );
      if (!result.ok) {
        setFailed(true);
        setMessage(errorMessage(result.code));
      } else {
        setMessage(
          "초대를 수락했습니다. 연결된 공간에서 내역을 확인해 주세요.",
        );
        setValue("");
      }
    } catch {
      setFailed(true);
      setMessage(
        "연결하지 못했습니다. 초대는 유지되며 잠시 후 다시 시도할 수 있습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title={kind === "student" ? "학생 계정 연결" : "강사 소속 연결"}>
      <p>
        초대받은 이메일의 계정으로 로그인한 후 수락해 주세요. 초대는 한 번만
        사용할 수 있습니다.
      </p>
      <form className={styles.form} onSubmit={accept}>
        <label>
          {kind === "student" ? "학생 초대 코드" : "강사 초대 코드"}
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            maxLength={512}
            autoComplete="off"
            type="password"
            disabled={busy}
          />
        </label>
        <button className={styles.primary} disabled={busy}>
          {busy ? "연결 확인 중…" : "초대 수락"}
        </button>
      </form>
      {message && (
        <p
          className={failed ? styles.error : styles.success}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      <Link
        className={styles.manualLink}
        href={kind === "student" ? "/learn" : "/instructor"}
      >
        연결된 공간 확인 →
      </Link>
    </Panel>
  );
}

export function LiveWorkspace({
  role,
  section = "overview",
}: {
  role: Role;
  section?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [academyCursor, setAcademyCursor] = useState<string | null>(null);
  const [offeringCursor, setOfferingCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [selectedAcademy, setSelectedAcademy] = useState("");
  const [academyDraft, setAcademyDraft] = useState<{
    academyId: string | null;
    name: string;
    region: string;
  }>({ academyId: null, name: "", region: "" });
  const [reason, setReason] = useState<Record<string, string>>({});
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const current = await api<Me>("/api/me", undefined, signal);
        if (!current.ok) {
          setMe(null);
          setLoadError(errorMessage(current.code));
          return;
        }
        setLoadError("");
        setMe(current.value);
        if (role === "owner" || role === "admin") {
          const result = await api<Academy[]>(
            role === "admin" ? "/api/academies?review=true" : "/api/academies",
            undefined,
            signal,
          );
          if (result.ok) {
            setAcademies(result.value);
            setAcademyCursor(result.nextCursor ?? null);
          } else setLoadError(errorMessage(result.code));
        }
        if (role === "owner" || role === "instructor") {
          const result = await api<Offering[]>(
            "/api/offerings",
            undefined,
            signal,
          );
          if (result.ok) {
            setOfferings(result.value);
            setOfferingCursor(result.nextCursor ?? null);
          } else setLoadError(errorMessage(result.code));
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setLoadError(
            "내역을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [role],
  );
  useEffect(() => {
    const controller = new AbortController();
    // This synchronizes external API data; load only updates state after awaiting fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function mutate<T>(
    key: string,
    url: string,
    body: unknown,
    success: string,
    done?: (value: T) => void,
  ) {
    if (busy) return;
    setBusy(key);
    setFailed(false);
    setMessage("");
    setInvite(null);
    try {
      const result = await api<T>(url, body);
      if (!result.ok) {
        setFailed(true);
        setMessage(errorMessage(result.code));
      } else {
        setMessage(success);
        done?.(result.value);
        setLoading(true);
        await load();
      }
    } catch {
      setFailed(true);
      setMessage(
        "연결하지 못했습니다. 작성 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setBusy("");
    }
  }
  async function loadMore(kind: "academies" | "offerings") {
    const cursor = kind === "academies" ? academyCursor : offeringCursor;
    if (!cursor || busy || loading) return;
    setBusy(`more-${kind}`);
    setFailed(false);
    setMessage("");
    try {
      if (kind === "academies") {
        const params = new URLSearchParams({ cursor });
        if (role === "admin") params.set("review", "true");
        const result = await api<Academy[]>(`/api/academies?${params}`);
        if (!result.ok) {
          setFailed(true);
          setMessage(errorMessage(result.code));
          return;
        }
        setAcademies((previous) => [
          ...new Map(
            [...previous, ...result.value].map((item) => [item.id, item]),
          ).values(),
        ]);
        setAcademyCursor(result.nextCursor ?? null);
        setMessage("학원 목록을 더 불러왔습니다.");
      } else {
        const params = new URLSearchParams({ cursor });
        const result = await api<Offering[]>(`/api/offerings?${params}`);
        if (!result.ok) {
          setFailed(true);
          setMessage(errorMessage(result.code));
          return;
        }
        setOfferings((previous) => [
          ...new Map(
            [...previous, ...result.value].map((item) => [item.id, item]),
          ).values(),
        ]);
        setOfferingCursor(result.nextCursor ?? null);
        setMessage("수업 목록을 더 불러왔습니다.");
      }
    } catch {
      setFailed(true);
      setMessage(
        "추가 내역을 불러오지 못했습니다. 현재 목록은 유지됩니다. 다시 시도해 주세요.",
      );
    } finally {
      setBusy("");
    }
  }
  const meta = info[role];
  const ownedMemberships =
    me?.memberships.filter((member) => member.role === "owner") ?? [];
  const academyId = selectedAcademy || ownedMemberships[0]?.academy.id || "";
  const selected = ownedMemberships.find(
    (member) => member.academy.id === academyId,
  )?.academy;
  const instructorOptions =
    me && academyId
      ? [
          {
            academyId,
            userId: me.user.id,
            email: me.user.email,
            role: "owner",
          },
          ...(me.instructors ?? []).filter(
            (member) =>
              member.academyId === academyId && member.userId !== me.user.id,
          ),
        ]
      : [];
  const disabled = Boolean(busy);
  const ready = Boolean(me);
  const showFailure = (text: string) => {
    setFailed(true);
    setMessage(text);
  };
  function handleInvite(value: Invite) {
    setInvite(value);
    if (value.delivery === "failed") {
      setFailed(true);
      setMessage(
        "초대는 생성되었지만 메일 발송에 실패했습니다. 운영자에게 발송 상태를 문의해 주세요.",
      );
    } else if (value.delivery === "manual")
      setMessage(
        "직접 전달할 초대 링크가 생성되었습니다. 확인된 수신자에게만 안전하게 전달해 주세요.",
      );
  }
  async function logout() {
    if (busy) return;
    setBusy("logout");
    try {
      const result = await api<unknown>("/api/auth/logout", {});
      if (result.ok) {
        setMe(null);
        router.replace("/login");
        router.refresh();
      } else showFailure(errorMessage(result.code));
    } catch {
      showFailure("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }
  return (
    <main id="main-content" className={`container ${styles.workspace}`}>
      <div className={styles.top}>
        <span>
          나의 EDUON / {meta.name} 공간 {me ? `· ${me.user.email}` : ""}
        </span>
        {me && (
          <button
            type="button"
            className={styles.secondary}
            disabled={disabled}
            onClick={logout}
          >
            {busy === "logout" ? "로그아웃 중…" : "로그아웃"}
          </button>
        )}
      </div>
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label={`${meta.name} 업무 메뉴`}>
          <div className={styles.navTitle}>{meta.name} 공간</div>
          {meta.nav.map(([name, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              {name}
            </Link>
          ))}
          <details>
            <summary>업무 메뉴</summary>
            {meta.nav.map(([name, href]) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
              >
                {name}
              </Link>
            ))}
          </details>
        </nav>
        <div className={styles.body}>
          <header className={styles.heading}>
            <p className={styles.eyebrow}>MY EDUON</p>
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
          </header>
          {loading && (
            <p className={styles.empty} role="status">
              내역을 불러오는 중입니다…
            </p>
          )}
          {loadError && (
            <div className={styles.error} role="alert">
              <p>{loadError}</p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setLoading(true);
                    setLoadError("");
                    void load();
                  }}
                  disabled={loading}
                >
                  다시 불러오기
                </button>
                {!me && (
                  <Link className={styles.primary} href="/login">
                    로그인하기
                  </Link>
                )}
              </div>
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
          {invite?.delivery === "manual" && invite.inviteUrl && (
            <div className={styles.warning}>
              <strong>본인 확인된 수신자에게만 전달하세요</strong>
              <a href={invite.inviteUrl} className={styles.manualLink}>
                초대 링크 열기
              </a>
              <p className={styles.note}>
                초대 링크는 이 화면에서만 표시되며 별도로 브라우저에 저장하지
                않습니다.
              </p>
            </div>
          )}
          {ready && me && !loading && (
            <>
              {role === "parent" && (
                <>
                  {!me.user.guardianVerifiedAt && (
                    <div className={styles.warning}>
                      <strong>보호자 확인이 필요합니다</strong>
                      <p>
                        이메일 로그인만으로 보호자 확인이 완료되지는 않습니다.
                        운영자에게 확인을 요청한 후 자녀를 등록할 수 있습니다.
                      </p>
                      <p className={styles.id}>
                        확인 요청용 계정 ID: {me.user.id}
                      </p>
                    </div>
                  )}
                  {section === "orders" ? (
                    <ParentOrders />
                  ) : (
                    <>
                      <Panel title="연결된 자녀">
                        {me.children.length ? (
                          <ul className={styles.list}>
                            {me.children.map((child) => (
                              <li key={child.id}>
                                <div className={styles.row}>
                                  <div>
                                    <h3>{child.name}</h3>
                                    <p>{gradeText(child.grade)}</p>
                                  </div>
                                  <span className={styles.badge}>
                                    {child.accountUserId
                                      ? "학생 계정 연결됨"
                                      : "학생 계정 연결 전"}
                                  </span>
                                </div>
                                {!child.accountUserId &&
                                  me.user.guardianVerifiedAt && (
                                    <form
                                      className={`${styles.form} ${styles.inlineForm}`}
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        const form = event.currentTarget;
                                        const data = new FormData(form);
                                        void mutate<Invite>(
                                          `invite-${child.id}`,
                                          "/api/guardian-invitations",
                                          {
                                            studentId: child.id,
                                            email: data.get("email"),
                                          },
                                          "초대 안내를 요청했습니다.",
                                          handleInvite,
                                        );
                                      }}
                                    >
                                      <label>
                                        학생 계정 이메일
                                        <input
                                          name="email"
                                          type="email"
                                          autoComplete="off"
                                          maxLength={254}
                                          required
                                        />
                                      </label>
                                      <button
                                        className={styles.secondary}
                                        disabled={disabled}
                                      >
                                        학생 계정 초대
                                      </button>
                                    </form>
                                  )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={styles.empty}>
                            연결된 자녀가 없습니다. 보호자 확인을 마친 뒤 자녀
                            프로필을 등록해 주세요.
                          </p>
                        )}
                      </Panel>
                      {me.user.guardianVerifiedAt && (
                        <Panel title="자녀 프로필 등록">
                          <form
                            className={styles.form}
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = event.currentTarget;
                              const data = new FormData(form);
                              void mutate(
                                "child",
                                "/api/children",
                                {
                                  name: String(data.get("name")).trim(),
                                  grade: Number(data.get("grade")),
                                },
                                "자녀 프로필을 등록했습니다.",
                                () => form.reset(),
                              );
                            }}
                          >
                            <div className={styles.columns}>
                              <label>
                                자녀 이름
                                <input
                                  name="name"
                                  required
                                  minLength={1}
                                  maxLength={80}
                                  autoComplete="off"
                                />
                              </label>
                              <label>
                                자녀 학년
                                <select name="grade" defaultValue="5">
                                  {Array.from({ length: 12 }, (_, index) => (
                                    <option key={index + 1} value={index + 1}>
                                      {gradeText(index + 1)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <p className={styles.note}>
                              다른 학생의 이름이나 이메일을 검색해 연결할 수
                              없습니다. 자녀의 학생 계정은 일회용 초대를 통해
                              연결합니다.
                            </p>
                            <button
                              className={styles.primary}
                              disabled={disabled}
                            >
                              {busy === "child" ? "등록 중…" : "자녀 등록"}
                            </button>
                          </form>
                        </Panel>
                      )}
                    </>
                  )}
                </>
              )}
              {role === "student" && (
                <>
                  {me.student ? (
                    <Panel title="나의 학생 프로필">
                      <h3>{me.student.name}</h3>
                      <p>
                        {gradeText(me.student.grade)} · 보호자와 연결된 학생
                        계정입니다.
                      </p>
                      <p className={styles.empty}>
                        수강 신청과 수업 입장은 다음 단계에서 연결됩니다. 현재
                        활성 수강권이나 화상수업을 제공하지 않습니다.
                      </p>
                      <Link className={styles.secondary} href="/classes">
                        공개 수업 찾기
                      </Link>
                    </Panel>
                  ) : (
                    <InvitationAccept kind="student" />
                  )}
                </>
              )}
              {role === "owner" && (
                <>
                  {section === "finance" ? (
                    <AcademyFinance memberships={me.memberships} />
                  ) : section === "students" ? (
                    <Panel title="수강생 관리">
                      <p>
                        결제·수강권 기능 연결 전입니다. 아직 실제
                        거래·정산·수강생 명단을 제공하지 않습니다.
                      </p>
                    </Panel>
                  ) : (
                    <>
                      <Panel title="내 학원">
                        {academies.length ? (
                          <ul className={styles.list}>
                            {academies.map((academy) => (
                              <li key={academy.id}>
                                <div className={styles.row}>
                                  <div>
                                    <h3>{academy.name}</h3>
                                    <p>{academy.region ?? "지역 정보 등록"}</p>
                                  </div>
                                  <span className={styles.badge}>
                                    {statusText[academy.status] ??
                                      academy.status}
                                  </span>
                                </div>
                                {academy.status === "rejected" && (
                                  <button
                                    type="button"
                                    className={styles.secondary}
                                    disabled={disabled}
                                    onClick={() => {
                                      setAcademyDraft({
                                        academyId: academy.id,
                                        name: academy.name,
                                        region: academy.region ?? "",
                                      });
                                      document
                                        .getElementById(
                                          "application-academy-name",
                                        )
                                        ?.focus();
                                    }}
                                  >
                                    재신청
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={styles.empty}>
                            등록된 학원이 없습니다. 입점 신청 후 운영자의 심사를
                            기다려 주세요.
                          </p>
                        )}
                        {academyCursor && (
                          <button
                            type="button"
                            className={styles.secondary}
                            disabled={disabled}
                            onClick={() => void loadMore("academies")}
                          >
                            {busy === "more-academies"
                              ? "학원 불러오는 중…"
                              : "학원 더 보기"}
                          </button>
                        )}
                      </Panel>
                      <Panel
                        title={
                          academyDraft.academyId
                            ? "반려된 학원 재신청"
                            : "학원 입점 신청"
                        }
                      >
                        {academyDraft.academyId && (
                          <p>
                            기존 학원 신청을 수정해 다시 제출합니다. 새로운
                            학원을 중복 생성하지 않습니다.
                          </p>
                        )}
                        <form
                          className={styles.form}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const form = event.currentTarget;
                            const data = new FormData(form);
                            void mutate(
                              "academy",
                              "/api/academies",
                              {
                                name: String(data.get("name")).trim(),
                                region: String(data.get("region")).trim(),
                                ...(academyDraft.academyId
                                  ? { academyId: academyDraft.academyId }
                                  : {}),
                              },
                              academyDraft.academyId
                                ? "기존 학원을 재신청했습니다. 운영자의 재검토를 기다려 주세요."
                                : "입점 신청이 접수되었습니다. 승인 전에는 수업을 공개할 수 없습니다.",
                              () =>
                                setAcademyDraft({
                                  academyId: null,
                                  name: "",
                                  region: "",
                                }),
                            );
                          }}
                        >
                          <label>
                            학원 이름
                            <input
                              id="application-academy-name"
                              name="name"
                              maxLength={120}
                              required
                              value={academyDraft.name}
                              onChange={(event) =>
                                setAcademyDraft((previous) => ({
                                  ...previous,
                                  name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            학원 지역
                            <input
                              name="region"
                              placeholder="예: 대구 수성구"
                              maxLength={100}
                              required
                              value={academyDraft.region}
                              onChange={(event) =>
                                setAcademyDraft((previous) => ({
                                  ...previous,
                                  region: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <button
                            className={styles.primary}
                            disabled={disabled}
                          >
                            {busy === "academy"
                              ? "제출 중…"
                              : academyDraft.academyId
                                ? "수정 후 재신청"
                                : "입점 신청"}
                          </button>
                          {academyDraft.academyId && (
                            <button
                              type="button"
                              className={styles.secondary}
                              disabled={disabled}
                              onClick={() =>
                                setAcademyDraft({
                                  academyId: null,
                                  name: "",
                                  region: "",
                                })
                              }
                            >
                              재신청 취소
                            </button>
                          )}
                        </form>
                      </Panel>
                      {ownedMemberships.length > 0 && (
                        <>
                          <Panel title="관리할 학원 선택">
                            <label className={styles.form}>
                              학원
                              <select
                                aria-label="관리 학원"
                                value={academyId}
                                onChange={(event) =>
                                  setSelectedAcademy(event.target.value)
                                }
                              >
                                {ownedMemberships.map((member) => (
                                  <option
                                    key={member.academy.id}
                                    value={member.academy.id}
                                  >
                                    {member.academy.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p>
                              현재 상태:{" "}
                              {selected
                                ? (statusText[selected.status] ??
                                  selected.status)
                                : "확인 중"}
                            </p>
                          </Panel>
                          <Panel title="강사 초대">
                            <form
                              className={styles.form}
                              onSubmit={(event) => {
                                event.preventDefault();
                                const data = new FormData(event.currentTarget);
                                void mutate<Invite>(
                                  "teacher-invite",
                                  `/api/academies/${academyId}/invitations`,
                                  { email: data.get("email") },
                                  "강사 초대를 요청했습니다.",
                                  handleInvite,
                                );
                              }}
                            >
                              <label>
                                초대할 강사 이메일
                                <input
                                  name="email"
                                  type="email"
                                  required
                                  maxLength={254}
                                />
                              </label>
                              <button
                                className={styles.secondary}
                                disabled={disabled}
                              >
                                강사 초대하기
                              </button>
                            </form>
                          </Panel>
                          <Panel title="새 수업 개설">
                            <p>
                              현재 학원에 소속된 원장 또는 초대를 수락한 강사를
                              담당자로 선택하세요. 회차를 등록한 뒤 공개할 수
                              있습니다.
                            </p>
                            <form
                              className={styles.form}
                              onSubmit={(event) => {
                                event.preventDefault();
                                const form = event.currentTarget;
                                const data = new FormData(form);
                                const startsAt = new Date(
                                  `${String(data.get("startsAt"))}+09:00`,
                                );
                                const endsAt = new Date(
                                  `${String(data.get("endsAt"))}+09:00`,
                                );
                                const opensAt = new Date(
                                  `${String(data.get("opensAt"))}+09:00`,
                                );
                                const closesAt = new Date(
                                  `${String(data.get("closesAt"))}+09:00`,
                                );
                                if (
                                  [startsAt, endsAt, opensAt, closesAt].some(
                                    (date) => Number.isNaN(date.getTime()),
                                  ) ||
                                  startsAt >= endsAt ||
                                  opensAt >= closesAt ||
                                  closesAt > startsAt
                                ) {
                                  showFailure(
                                    "회차 종료는 시작 이후, 모집 종료는 모집 시작 이후·수업 시작 이전으로 입력해 주세요.",
                                  );
                                  return;
                                }
                                void mutate(
                                  "offering",
                                  "/api/offerings",
                                  {
                                    academyId,
                                    title: String(data.get("title")).trim(),
                                    subject: data.get("subject"),
                                    gradeMin: Number(data.get("gradeMin")),
                                    gradeMax: Number(data.get("gradeMax")),
                                    level: data.get("level"),
                                    priceWon: Number(data.get("priceWon")),
                                    capacity: Number(data.get("capacity")),
                                    enrollmentOpensAt: opensAt.toISOString(),
                                    enrollmentClosesAt: closesAt.toISOString(),
                                    instructorIds: [
                                      String(data.get("instructorId")),
                                    ],
                                    sessions: [
                                      {
                                        startsAt: startsAt.toISOString(),
                                        endsAt: endsAt.toISOString(),
                                      },
                                    ],
                                  },
                                  "수업 초안을 등록했습니다. 공개 전 내용을 확인해 주세요.",
                                  () => form.reset(),
                                );
                              }}
                            >
                              <label>
                                수업 이름
                                <input name="title" maxLength={150} required />
                              </label>
                              <label>
                                담당 강사
                                <select
                                  key={academyId}
                                  name="instructorId"
                                  defaultValue={me.user.id}
                                  required
                                >
                                  {instructorOptions.map((member) => (
                                    <option
                                      key={member.userId}
                                      value={member.userId}
                                    >
                                      {member.email} (
                                      {member.role === "owner"
                                        ? "원장"
                                        : "강사"}
                                      )
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className={styles.columns}>
                                <label>
                                  과목
                                  <select name="subject">
                                    <option value="math">수학</option>
                                    <option value="english">영어</option>
                                  </select>
                                </label>
                                <label>
                                  수준
                                  <select name="level">
                                    <option value="beginner">기초</option>
                                    <option value="intermediate">
                                      기본·응용
                                    </option>
                                    <option value="advanced">심화</option>
                                  </select>
                                </label>
                                <label>
                                  최소 학년
                                  <select name="gradeMin" defaultValue="4">
                                    {Array.from({ length: 12 }, (_, index) => (
                                      <option key={index + 1} value={index + 1}>
                                        {gradeText(index + 1)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  최대 학년
                                  <select name="gradeMax" defaultValue="6">
                                    {Array.from({ length: 12 }, (_, index) => (
                                      <option key={index + 1} value={index + 1}>
                                        {gradeText(index + 1)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  총 수강료 (원)
                                  <input
                                    name="priceWon"
                                    type="number"
                                    min={0}
                                    max={10000000}
                                    step={1}
                                    required
                                  />
                                </label>
                                <label>
                                  정원 (명)
                                  <input
                                    name="capacity"
                                    type="number"
                                    min={1}
                                    max={100}
                                    step={1}
                                    required
                                  />
                                </label>
                                <label>
                                  모집 시작
                                  <input
                                    name="opensAt"
                                    type="datetime-local"
                                    required
                                  />
                                </label>
                                <label>
                                  모집 종료
                                  <input
                                    name="closesAt"
                                    type="datetime-local"
                                    required
                                  />
                                </label>
                                <label>
                                  수업 시작
                                  <input
                                    name="startsAt"
                                    type="datetime-local"
                                    required
                                  />
                                </label>
                                <label>
                                  수업 종료
                                  <input
                                    name="endsAt"
                                    type="datetime-local"
                                    required
                                  />
                                </label>
                              </div>
                              <p className={styles.note}>
                                일시는 한국 시간(Asia/Seoul) 기준으로
                                입력합니다. 서버에는 UTC로 변환해 저장합니다.
                              </p>
                              <button
                                className={styles.primary}
                                disabled={disabled}
                              >
                                {busy === "offering"
                                  ? "수업 등록 중…"
                                  : "수업 초안 등록"}
                              </button>
                            </form>
                          </Panel>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              {(role === "owner" || role === "instructor") &&
                section !== "finance" &&
                section !== "students" && (
                  <Panel
                    title={role === "owner" ? "등록된 수업" : "배정된 수업"}
                  >
                    {offerings.length ? (
                      <ul className={styles.list}>
                        {offerings.map((offering) => (
                          <li key={offering.id}>
                            <div className={styles.row}>
                              <div>
                                <h3>{offering.course.title}</h3>
                                <p>
                                  {offering.priceWon.toLocaleString("ko-KR")}원
                                  · 정원 {offering.capacity}명 ·{" "}
                                  {offering.sessions.length}회
                                </p>
                              </div>
                              <span className={styles.badge}>
                                {statusText[offering.status] ?? offering.status}
                              </span>
                            </div>
                            <p>
                              {gradeText(offering.course.gradeMin)} ~{" "}
                              {gradeText(offering.course.gradeMax)}
                            </p>
                            {offering.sessions.map((session, index) => (
                              <p className={styles.note} key={session.startsAt}>
                                {index + 1}회:{" "}
                                {new Intl.DateTimeFormat("ko-KR", {
                                  timeZone: "Asia/Seoul",
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(session.startsAt))}{" "}
                                (Asia/Seoul)
                              </p>
                            ))}
                            {role === "owner" &&
                              offering.status === "draft" && (
                                <button
                                  type="button"
                                  className={styles.primary}
                                  disabled={disabled}
                                  onClick={() =>
                                    void mutate(
                                      `publish-${offering.id}`,
                                      `/api/offerings/${offering.id}/publish`,
                                      {},
                                      "수업이 공개되었습니다.",
                                    )
                                  }
                                >
                                  수업 공개
                                </button>
                              )}
                            {offering.status === "published" && (
                              <Link
                                className={styles.manualLink}
                                href={`/classes/${offering.id}`}
                              >
                                공개 화면 확인 →
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.empty}>
                        {role === "owner"
                          ? "등록된 수업이 없습니다. 학원 승인과 강사 배정을 확인한 후 첫 수업을 등록해 주세요."
                          : "배정된 수업이 없습니다. 학원 원장에게 소속과 담당 수업 배정을 확인해 주세요."}
                      </p>
                    )}
                    {offeringCursor && (
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={disabled}
                        onClick={() => void loadMore("offerings")}
                      >
                        {busy === "more-offerings"
                          ? "수업 불러오는 중…"
                          : "수업 더 보기"}
                      </button>
                    )}
                  </Panel>
                )}
              {role === "instructor" && <InvitationAccept kind="instructor" />}
              {role === "admin" &&
                (me.user.platformAdmin ? (
                  <>
                    {section === "payments" ? (
                      <AdminPayments />
                    ) : (
                      <>
                        <Panel title="학원 입점 심사">
                          {academies.length ? (
                            <ul className={styles.list}>
                              {academies.map((academy) => (
                                <li key={academy.id}>
                                  <div className={styles.row}>
                                    <div>
                                      <h3>{academy.name}</h3>
                                      <p>{academy.region}</p>
                                    </div>
                                    <span className={styles.badge}>
                                      {statusText[academy.status] ??
                                        academy.status}
                                    </span>
                                  </div>
                                  <label
                                    className={`${styles.form} ${styles.inlineForm}`}
                                  >
                                    심사 사유
                                    <textarea
                                      maxLength={1000}
                                      value={reason[academy.id] ?? ""}
                                      onChange={(event) =>
                                        setReason((previous) => ({
                                          ...previous,
                                          [academy.id]: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <div className={styles.actions}>
                                    {(
                                      [
                                        ["approved", "승인"],
                                        ["rejected", "반려"],
                                        ["suspended", "정지"],
                                      ] as const
                                    ).map(([decision, label]) => (
                                      <button
                                        key={decision}
                                        type="button"
                                        className={
                                          decision === "approved"
                                            ? styles.primary
                                            : styles.secondary
                                        }
                                        disabled={
                                          disabled ||
                                          !reason[academy.id]?.trim()
                                        }
                                        onClick={() =>
                                          void mutate(
                                            `decision-${academy.id}`,
                                            `/api/academies/${academy.id}/decision`,
                                            {
                                              decision,
                                              reason:
                                                reason[academy.id]?.trim(),
                                            },
                                            `학원 심사 결과를 ${label} 상태로 기록했습니다.`,
                                          )
                                        }
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className={styles.empty}>
                              검토할 학원 신청이 없습니다.
                            </p>
                          )}
                          {academyCursor && (
                            <button
                              type="button"
                              className={styles.secondary}
                              disabled={disabled}
                              onClick={() => void loadMore("academies")}
                            >
                              {busy === "more-academies"
                                ? "학원 불러오는 중…"
                                : "학원 더 보기"}
                            </button>
                          )}
                        </Panel>
                        <Panel title="보호자 확인 기록">
                          <p>
                            증빙과 관계 확인을 실제로 마친 경우에만 확인 사유를
                            기록해 주세요. 이메일 인증만으로 보호자 확인을
                            승인하지 않습니다.
                          </p>
                          <form
                            className={styles.form}
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = event.currentTarget;
                              const data = new FormData(form);
                              void mutate(
                                "guardian-verify",
                                "/api/guardian-verifications",
                                {
                                  userId: String(data.get("userId")).trim(),
                                  reason: String(data.get("reason")).trim(),
                                },
                                "보호자 확인 근거를 기록했습니다.",
                                () => form.reset(),
                              );
                            }}
                          >
                            <label>
                              보호자 계정 ID
                              <input name="userId" required maxLength={100} />
                            </label>
                            <label>
                              확인 방법과 사유
                              <textarea
                                name="reason"
                                required
                                minLength={10}
                                maxLength={500}
                              />
                            </label>
                            <button
                              className={styles.primary}
                              disabled={disabled}
                            >
                              보호자 확인 기록
                            </button>
                          </form>
                        </Panel>
                      </>
                    )}
                  </>
                ) : (
                  <p className={styles.error} role="alert">
                    운영자 권한이 없습니다. 화면 주소만으로 운영 권한을 얻을 수
                    없습니다.
                  </p>
                ))}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
