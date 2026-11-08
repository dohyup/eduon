"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { WorkspaceShell } from "./layout/workspace-shell";
import { trapDialogFocus } from "./ui/focus";
import { demoChildren, roleInfo, type WorkspaceRole } from "../demo/workspaces";
import styles from "./workspace.module.css";

function Action({
  label,
  title = "데모 기능 안내",
  children,
}: {
  label: string;
  title?: string;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className={styles.action}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={id}
        onKeyDown={trapDialogFocus}
      >
        <h2 id={id}>{title}</h2>
        <p>
          {children ??
            "화면 흐름을 확인하는 데모입니다. 실제 수업 참여, 결제, 외부 전송은 실행되지 않습니다."}
        </p>
        <form method="dialog">
          <button className={styles.action}>확인하고 닫기</button>
        </form>
      </dialog>
    </>
  );
}
function Stats({ items }: { items: [string, string, string][] }) {
  return (
    <div className={styles.stats}>
      {items.map(([label, value, unit]) => (
        <div className={styles.stat} key={label}>
          <span>{label}</span>
          <strong>
            {value}
            <small>{unit}</small>
          </strong>
        </div>
      ))}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Workspace({
  role,
  section = "overview",
}: {
  role: WorkspaceRole;
  section?: string;
}) {
  const [childId, setChildId] = useState(demoChildren[0].id);
  const [attendance, setAttendance] = useState("present");
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState("");
  const [review, setReview] = useState("검토 대기");
  const [viewState, setViewState] = useState("normal");
  const child =
    demoChildren.find((item) => item.id === childId) ?? demoChildren[0];
  const roleMeta = roleInfo[role];
  const titles: Record<string, string> = {
    children: "자녀의 배움을 함께 연결해요",
    orders: "결제 내역을 투명하게",
    classes:
      role === "student"
        ? "수업과 과제"
        : role === "instructor"
          ? "출결과 학습 피드백"
          : "우리 학원의 수업",
    students: "함께 배우는 수강생",
    finance: "거래와 정산 내역",
    academies: "학원 입점 신청 검토",
    payments: "거래와 처리 현황",
  };
  const title = titles[section] ?? roleMeta.title;
  function save(message: string) {
    setSaved(
      `${message} · 이 페이지에서만 유지되며 새로고침하면 초기화됩니다.`,
    );
  }
  return (
    <WorkspaceShell role={role}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>MY EDUON / {roleMeta.name}</p>
        <h1>{title}</h1>
        <p>{roleMeta.description}</p>
      </header>
      {role === "parent" && (
        <div className={styles.childPicker}>
          <label htmlFor="demo-child">자녀 선택</label>
          <select
            id="demo-child"
            value={childId}
            onChange={(event) => {
              setChildId(event.target.value);
              setSaved("");
            }}
          >
            {demoChildren.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span>{child.grade} · 연결된 데모 프로필</span>
        </div>
      )}
      <div className={styles.stateSelect}>
        <label htmlFor="view-state">화면 상태 체험</label>
        <select
          id="view-state"
          value={viewState}
          onChange={(event) => setViewState(event.target.value)}
        >
          <option value="normal">기본 화면</option>
          <option value="empty">아직 내역이 없을 때</option>
          <option value="error">불러오기에 실패했을 때</option>
          <option value="loading">불러오는 중</option>
          <option value="pending">확인을 기다릴 때</option>
        </select>
      </div>
      {viewState === "empty" ? (
        <div className={styles.empty}>
          <h2>새로운 배움을 시작해 볼까요?</h2>
          <p>
            아직 등록된 내역이 없습니다. 관심 있는 수업부터 천천히 찾아보세요.
          </p>
          <Link className={styles.action} href="/classes">
            수업 찾기
          </Link>
        </div>
      ) : viewState === "error" ? (
        <div className={styles.error} role="alert">
          <p>데모 오류 상태입니다. 잠시 후 다시 시도해 주세요.</p>
          <button
            type="button"
            className={styles.action}
            onClick={() => setViewState("normal")}
          >
            다시 시도
          </button>
        </div>
      ) : viewState === "loading" ? (
        <div className={styles.panel} role="status">
          <h2>내역을 불러오는 중입니다</h2>
          <p>데모 로딩 상태를 확인하고 있습니다.</p>
          <button
            className={styles.action}
            onClick={() => setViewState("normal")}
          >
            기본 화면으로 돌아가기
          </button>
        </div>
      ) : (
        <>
          {viewState === "pending" && (
            <div className={styles.panel} role="status">
              <span className={`${styles.chip} ${styles.amber}`}>
                확인 대기
              </span>
              <p>
                데모 처리 상태입니다. 확인 전에는 수강·결제 완료로 표시하지
                않습니다.
              </p>
            </div>
          )}
          {role === "parent" && section === "children" ? (
            <>
              <Stats
                items={[
                  ["연결된 자녀", "2", "명"],
                  ["진행 중 수업", "2", "개"],
                  ["확인할 피드백", "1", "건"],
                ]}
              />
              <Panel title="연결된 자녀 프로필">
                <ul className={styles.list}>
                  {demoChildren.map((item) => (
                    <li key={item.id}>
                      <div className={styles.row}>
                        <div>
                          <strong>{item.name}</strong>
                          <p>
                            {item.grade} · {item.academy}
                          </p>
                        </div>
                        <span className={`${styles.chip} ${styles.green}`}>
                          데모 연결
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="자녀 계정 연결">
                <p>
                  보호자 확인 후 일회용 초대로 학생 계정을 연결하는 흐름입니다.
                  지금은 실제 초대를 발송하지 않습니다.
                </p>
                <Action label="학생 연결 안내" title="자녀 연결 데모 안내" />
              </Panel>
            </>
          ) : role === "parent" && section === "orders" ? (
            <>
              <Panel title={`${child.name}의 결제 내역`}>
                <div className={styles.row}>
                  <span className={styles.chip}>합성 거래 예시</span>
                  <span className={styles.muted}>2030. 01. 01</span>
                </div>
                <h3>{child.title}</h3>
                <p>
                  {child.academy} · {child.sessionCount}회 과정
                </p>
                <div className={styles.row}>
                  <strong>{child.priceWon.toLocaleString("ko-KR")}원</strong>
                  <span className={`${styles.chip} ${styles.amber}`}>
                    데모 · 실제 결제 없음
                  </span>
                </div>
                <div className={styles.divider} />
                <Action label="취소·환불 안내" title="환불 안내 데모">
                  운영 MVP에서는 결제 당시의 환불 정책과 수업 이력을 기준으로
                  요청하게 됩니다. 이 데모에는 실제 주문이나 환불이 없습니다.
                </Action>
              </Panel>
            </>
          ) : role === "parent" ? (
            <>
              <Stats
                items={[
                  ["함께하는 수업", "1", "개"],
                  ["이번 주 출석", "2", "회"],
                  ["확인할 과제", "1", "개"],
                ]}
              />
              <div className={styles.twoCol}>
                <Panel title="다음 수업">
                  <div className={styles.row}>
                    <span className={styles.chip}>
                      {child.subject} · {child.grade}
                    </span>
                    <span className={`${styles.chip} ${styles.green}`}>
                      데모 일정
                    </span>
                  </div>
                  <h3>{child.title}</h3>
                  <p>
                    {child.academy} · {child.teacher}
                  </p>
                  <div className={styles.schedule}>
                    <div className={styles.date}>
                      1월<strong>{child.day}</strong>
                    </div>
                    <div>
                      <strong>{child.time}</strong>
                      <p>온라인 · 50분 · Asia/Seoul</p>
                    </div>
                  </div>
                  <Link className={styles.textLink} href="/learn">
                    학생 화면 살펴보기 →
                  </Link>
                </Panel>
                <Panel title="이번 주 학습 과제">
                  <span className={`${styles.chip} ${styles.amber}`}>
                    제출 전 · 데모
                  </span>
                  <h3>{child.task}</h3>
                  <p>2030년 1월 9일 18:00까지</p>
                  <p>정답보다 스스로 생각한 풀이 과정을 중요하게 생각해요.</p>
                  <Action label="과제 내용 확인" title="학습 과제 안내">
                    {child.task}. 실제 제출·채점은 P2 이후 연결됩니다.
                  </Action>
                </Panel>
              </div>
              <Panel title="선생님의 학습 피드백">
                <div className={styles.row}>
                  <strong>{child.teacher}</strong>
                  <span className={styles.muted}>합성 피드백 예시</span>
                </div>
                <div className={styles.feedback}>{child.feedback}</div>
                <span className={styles.chip}>
                  학생의 실제 성적·평가가 아닙니다
                </span>
              </Panel>
            </>
          ) : role === "student" ? (
            <>
              <Stats
                items={[
                  ["나의 수업", "1", "개"],
                  ["오늘의 과제", "1", "개"],
                  ["받은 피드백", "1", "건"],
                ]}
              />
              <div className={styles.twoCol}>
                <Panel title="다음 수업">
                  <span className={styles.chip}>수학 · 초등 5학년</span>
                  <h3>{demoChildren[0].title}</h3>
                  <p>이음 선생님 · 2030년 1월 1일 17:00 – 17:50</p>
                  <div className={styles.feedback}>
                    필기구와 노트를 준비해 주세요.
                    <br />
                    천천히 생각하고 자유롭게 질문해요.
                  </div>
                  <Action label="수업 입장" title="수업 입장 데모 안내">
                    실제 화상회의에 연결되지 않습니다. 운영 MVP에서는 수강권과
                    입장 가능 시간을 확인한 후 수업에 입장합니다.
                  </Action>
                </Panel>
                <Panel title="오늘의 과제">
                  <h3>{demoChildren[0].task}</h3>
                  <p>풀이 과정을 두 문장 이상으로 적어 보세요.</p>
                  <label className={styles.field}>
                    나의 답안
                    <textarea
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      maxLength={1000}
                      placeholder="어떤 방법으로 생각했나요?"
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() =>
                      save(
                        feedback.trim()
                          ? "답안을 데모에 저장했어요"
                          : "답안을 입력한 뒤 다시 저장해 주세요",
                      )
                    }
                  >
                    답안 데모 저장
                  </button>
                </Panel>
              </div>
              <Panel title="최근 피드백">
                <div className={styles.feedback}>
                  {demoChildren[0].feedback}
                </div>
                <Link className={styles.textLink} href="/learn/classes/math-1">
                  수업과 과제 살펴보기 →
                </Link>
              </Panel>
            </>
          ) : role === "owner" && section === "finance" ? (
            <>
              <Stats
                items={[
                  ["수강료 예시", "200,000", "원"],
                  ["환불 예시", "0", "원"],
                  ["실제 지급액", "0", "원"],
                ]}
              />
              <Panel title="정산 확인">
                <span className={`${styles.chip} ${styles.amber}`}>
                  모의 내역 · 정산 미실행
                </span>
                <p>
                  결제·환불·수수료·학원 귀속액은 운영 정책이 확정된 이후
                  연결됩니다. 현재 금액은 화면 검토를 위한 합성 데이터입니다.
                </p>
                <Action label="정산 흐름 안내">
                  운영 MVP는 거래 원장과 외부 지급 참조를 기록합니다. 이
                  데모에서는 실제 송금이나 수수료 계산을 실행하지 않습니다.
                </Action>
              </Panel>
            </>
          ) : role === "owner" && section === "students" ? (
            <Panel title="수강생 현황">
              <ul className={styles.list}>
                {demoChildren.map((item) => (
                  <li key={item.id}>
                    <div className={styles.row}>
                      <div>
                        <strong>{item.name}</strong>
                        <p>
                          {item.grade} · {item.title}
                        </p>
                      </div>
                      <Action
                        label={`${item.name} 학습 확인`}
                        title="수강생 학습 현황"
                      >
                        합성 수강생의 학습 화면입니다. 실제 학생 기록은 소속
                        학원과 담당 수업의 권한을 확인한 후 제공됩니다.
                      </Action>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : role === "owner" ? (
            <>
              <Stats
                items={[
                  ["오늘 수업", "2", "개"],
                  ["확인할 신청", "1", "건"],
                  ["출결 누락", "1", "건"],
                ]}
              />
              <div className={styles.toolbar}>
                <span className={styles.muted}>
                  이음수학 배움교실 · 가상 운영 공간
                </span>
                <Action label="수업 개설" title="수업 개설 데모 안내">
                  학원 승인 후 강좌·모집기수·회차·가격·정원을 입력하는
                  흐름입니다. 현재 실제 수업은 등록되지 않습니다.
                </Action>
              </div>
              <Panel
                title={
                  section === "classes" ? "모집 중인 수업 예시" : "오늘 수업"
                }
              >
                <ul className={styles.list}>
                  {[
                    demoChildren[0],
                    {
                      ...demoChildren[0],
                      id: "math-2",
                      title: "개념부터 탄탄하게, 중등 수학",
                      time: "월·수 19:00 – 19:50",
                    },
                  ].map((item) => (
                    <li key={item.id}>
                      <div className={styles.row}>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.time} · 이음 선생님</p>
                        </div>
                        <Link
                          className={`${styles.action} ${styles.secondary}`}
                          href="/instructor/classes/math-1"
                        >
                          수업 관리
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
              <div className={styles.twoCol}>
                <Panel title="처리할 수강 신청">
                  <span className={`${styles.chip} ${styles.amber}`}>
                    데모 신청 1건
                  </span>
                  <h3>가상 학생 가람</h3>
                  <p>초등 수학 · 다음 모집기수</p>
                  <Action label="신청 내용 확인" title="수강 신청 안내">
                    학부모 결제와 좌석 예약을 확인한 뒤 실제 수강권이
                    생성됩니다. 현재 신청은 합성 예시입니다.
                  </Action>
                </Panel>
                <Panel title="수업 준비 체크">
                  <ul className={styles.list}>
                    <li>
                      <strong>출결 확인이 필요해요</strong>
                      <p>초등 수학 · 이음 선생님</p>
                    </li>
                    <li>
                      <strong>다음 수업 자료 준비</strong>
                      <p>학생에게 공개할 자료를 확인하세요.</p>
                    </li>
                  </ul>
                  <Link className={styles.textLink} href="/instructor">
                    강사 화면으로 이동 →
                  </Link>
                </Panel>
              </div>
            </>
          ) : role === "instructor" ? (
            <>
              <Stats
                items={[
                  ["오늘 담당 수업", "2", "개"],
                  ["출결 확인", "1", "건"],
                  ["피드백 대기", "1", "건"],
                ]}
              />
              <Panel title="담당 수업">
                <div className={styles.row}>
                  <div>
                    <span className={styles.chip}>이음수학 배움교실</span>
                    <h3>{demoChildren[0].title}</h3>
                    <p>2030년 1월 1일 17:00 – 17:50 · 가상 수강생 2명</p>
                  </div>
                  <Action label="강사 수업 입장" title="강사 입장 안내" />
                </div>
              </Panel>
              <div className={styles.twoCol}>
                <Panel title="출결 확인">
                  <label className={styles.field}>
                    가상 학생 가람 출결
                    <select
                      aria-label="가상 학생 가람 출결"
                      value={attendance}
                      onChange={(event) => setAttendance(event.target.value)}
                    >
                      <option value="present">출석</option>
                      <option value="late">지각</option>
                      <option value="absent">결석</option>
                    </select>
                  </label>
                  <p>2030년 1월 1일 수업 · 데모 회차</p>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() =>
                      save(
                        `출결을 데모에 저장했어요 (${attendance === "present" ? "출석" : attendance === "late" ? "지각" : "결석"})`,
                      )
                    }
                  >
                    출결 저장
                  </button>
                </Panel>
                <Panel title="학생에게 전할 피드백">
                  <label className={styles.field}>
                    학습 피드백
                    <textarea
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      maxLength={1000}
                      placeholder="학생이 잘한 점과 다음 학습 방향을 적어 주세요."
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() =>
                      save(
                        feedback.trim()
                          ? "피드백을 데모에 저장했어요"
                          : "피드백을 입력한 뒤 다시 저장해 주세요",
                      )
                    }
                  >
                    피드백 데모 저장
                  </button>
                </Panel>
              </div>
            </>
          ) : role === "admin" && section === "payments" ? (
            <>
              <Stats
                items={[
                  ["데모 거래", "2", "건"],
                  ["확인 대기", "1", "건"],
                  ["실제 처리", "0", "건"],
                ]}
              />
              <Panel title="거래 처리 현황">
                <ul className={styles.list}>
                  <li>
                    <div className={styles.row}>
                      <div>
                        <strong>가상 주문 DEMO-001</strong>
                        <p>이음수학 배움교실 · 120,000원 예시</p>
                      </div>
                      <span className={`${styles.chip} ${styles.amber}`}>
                        확인 대기 예시
                      </span>
                    </div>
                  </li>
                  <li>
                    <div className={styles.row}>
                      <div>
                        <strong>가상 주문 DEMO-002</strong>
                        <p>온빛영어 배움교실 · 취소 요청 예시</p>
                      </div>
                      <Action label="거래 처리 안내">
                        실제 PG 확인과 서명 검증 없이 결제나 환불을 완료 처리할
                        수 없습니다. 현재 거래는 합성 데이터입니다.
                      </Action>
                    </div>
                  </li>
                </ul>
              </Panel>
            </>
          ) : (
            <>
              <Stats
                items={[
                  ["입점 신청", "1", "건"],
                  ["확인할 거래", "1", "건"],
                  ["시스템 상태", "데모", "모드"],
                ]}
              />
              <Panel title="학원 입점 신청">
                <div className={styles.row}>
                  <span className={styles.chip}>
                    온라인 전환 신청 · 가상 학원
                  </span>
                  <span
                    className={`${styles.chip} ${review === "승인 처리" ? styles.green : styles.amber}`}
                  >
                    {review}
                  </span>
                </div>
                <h3>이음수학 배움교실</h3>
                <p>대구 · 수학 · 학원 정보와 강사 이력 확인 예시</p>
                <div className={styles.feedback}>
                  학원 정보, 대표자 확인, 강사 소속을 검토한 후 공개 모집을
                  승인하는 흐름입니다. 이 화면의 기관은 실제 기관이 아닙니다.
                </div>
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => {
                      setReview("승인 처리");
                      save("입점 신청을 데모에서 승인 처리했어요");
                    }}
                  >
                    승인
                  </button>
                  <button
                    type="button"
                    className={`${styles.action} ${styles.secondary}`}
                    onClick={() => {
                      setReview("보완 요청");
                      save(
                        "데모 보완 요청을 기록했어요. 실제 메시지는 발송되지 않습니다",
                      );
                    }}
                  >
                    보완 요청
                  </button>
                </div>
              </Panel>
              <Panel title="운영 기록">
                <p>
                  화면에서 수행한 동작은 현재 페이지에서만 유지됩니다. 운영
                  MVP에서는 처리자·대상·시간·사유를 감사 기록으로 저장합니다.
                </p>
                <Link className={styles.textLink} href="/admin/payments">
                  거래 현황 확인 →
                </Link>
              </Panel>
            </>
          )}
        </>
      )}
      {saved && (
        <p className={styles.message} role="status">
          {saved}
        </p>
      )}
      <p className={styles.note}>
        모든 이름·학원·일정·금액·학습 기록은 합성 예시입니다. 이 화면은 권한이
        분리된 실제 서비스가 아니며, 실제 결제 및 수강은 불가합니다.
      </p>
    </WorkspaceShell>
  );
}

export function AccountDemo({
  mode,
}: {
  mode: "login" | "signup" | "onboarding";
}) {
  const titles = {
    login: "나의 배움을 이어가세요",
    signup: "EDUON과 함께 시작해요",
    onboarding: "어떤 배움을 연결할까요?",
  };
  return (
    <main id="main-content" className="container">
      <div className={styles.auth}>
        <p className={styles.eyebrow}>WELCOME TO EDUON</p>
        <h1>{titles[mode]}</h1>
        <p>
          지금은 반응형 프로토타입입니다. 개인정보 입력 없이 역할별 화면을
          체험할 수 있어요.
        </p>
        <div className={styles.feedback}>
          <strong>실제 로그인·회원가입은 제공하지 않습니다.</strong>
          <br />각 역할의 화면과 학습 흐름을 먼저 살펴보세요.
        </div>
        <div className={styles.authLinks}>
          {Object.values(roleInfo).map((info) => (
            <Link href={info.root} key={info.root}>
              {info.name} 체험 →
            </Link>
          ))}
        </div>
        <p className={styles.note}>
          실제 인증과 보호자 확인은 다음 개발 단계에서 연결됩니다.
        </p>
        <Link className={styles.textLink} href="/classes">
          먼저 수업 둘러보기 →
        </Link>
      </div>
    </main>
  );
}
