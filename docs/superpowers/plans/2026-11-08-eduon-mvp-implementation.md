# EDUON MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 사용자가 병렬 실행을 선택하면 superpowers:subagent-driven-development를 적용한다. 현재 계획 작성에서는 서브에이전트를 사용하지 않는다.

**Goal:** 학원 개설부터 학부모 결제·학생 수강까지 연결되는 EDUON MVP를 순차 완성한다.

**Architecture:** Next.js 단일 웹앱에서 업무 모듈별 서버 서비스를 사용한다. PostgreSQL의 관계·트랜잭션과 서버 권한 검사를 기반으로 하고 인증·결제·화상·파일·선택적 LLM은 어댑터로 격리한다. 공개 UI 프로토타입과 실제 운영 MVP의 완료 기준을 분리한다.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL, 안정 버전 확인 후 Prisma, Vitest, Testing Library, Playwright, axe-core. 실제 버전은 P1-01에서 공식 호환성을 확인하여 고정한다.

**Spec:** `C:/dev/eduon/docs/superpowers/specs/2026-11-08-eduon-mvp-design.md` 및 `C:/dev/eduon/DESIGN.md`.

## Global Constraints

- “학부모가 결제 주체, 학생이 수업 참여 주체”. 주문은 “한 자녀·한 모집기수”.
- “단일 Next.js App Router + TypeScript 웹앱, PostgreSQL, 서버 전용 데이터 접근 계층”.
- “일정은 UTC로 저장하고 Asia/Seoul로 표시한다.” 원화 정수 금액, 가격·정책 스냅샷 보존.
- “검증된 결제만 활성화”, “브라우저 리다이렉트는 성공 증거가 아님”.
- “클라이언트의 academyId나 studentId를 신뢰하지 않는다.”
- “360/390/768/1024/1440px”, 터치 대상 최소 44px, 본문 대비 4.5:1 이상.
- “녹화는 기본 비활성화한다.” 가짜 후기·실적·검증 배지·성적 향상 보장 금지.
- “LLM 없는 조건 추천도 MVP 완료 범위다.” 학생 정보·결제 정보 외부 LLM 전달 금지.
- 커리업 삭제 41개를 복원하지 않는다. 과거 이력을 현재 코드로 간주하지 않는다.
- 지금은 계획 문서만 작성한다. 앱 생성·패키지 설치·DB 변경·배포는 실행하지 않는다.

## What already exists

실제 앱·package.json·테스트·DB는 없다. 재사용 자산은 승인된 제품 설계와 DESIGN.md다. Git에는 사용자 삭제가 남아 있다. 기능 테스트 명령은 아래 계획으로 새로 정의할 명령이며 **현재 실행 가능한 명령이 아니다**.

## 하위 계획과 의존성

| 순서 | 계획 | 독립적으로 검토 가능한 산출물 | 선행 |
| --- | --- | --- | --- |
| P1 | [반응형 프로토타입](./2026-11-08-eduon-p1-interface.md) | 가상 데이터로 탐색·역할별 업무 흐름 확인 | 설계 승인 완료 |
| P2 | [신원·학원·수업](./2026-11-08-eduon-p2-foundation.md) | 실제 인증·학원 승인·자녀 연결·수업 공개 | P1 |
| P3 | [수강·결제·환불](./2026-11-08-eduon-p3-commerce.md) | 테스트 결제~수강권·환불·재처리 | P2 |
| P4 | [학습 운영·출시 검증](./2026-11-08-eduon-p4-learning-release.md) | 입장·학습·후기·운영 기록, 시범 운영 준비 | P3 |

각 계획은 동작하는 작은 산출물을 남긴다. P1은 디자인 검토용이며 실서비스가 아니다. P2도 결제 서비스 완성을 뜻하지 않는다. 각 Task의 체크박스는 실제 검증 후에만 체크한다. 계획상의 예상 결과를 실행 결과로 보고하지 않는다.

## 파일 구조와 책임

```text
src/app/                       라우트·서버 진입점, 업무 규칙 직접 구현 금지
src/components/ui/             버튼·입력·다이얼로그·상태 표현
src/components/layout/         공개 헤더·역할별 셸·모바일 메뉴
src/modules/identity/          세션, 소속·보호자 관계, 권한
src/modules/academies/         입점 심사·소속 강사
src/modules/catalog/           수업·모집기수·회차·검색
src/modules/recommendations/   조건 필터·점수·추천 설명
src/modules/enrollment/        좌석·주문·수강권
src/modules/payments/          결제 이벤트·환불·정산 원장
src/modules/learning/          입장·출결·과제·후기
src/server/                    DB·공통 오류·설정·감사·레이트리밋
src/integrations/              인증·메일·PG·화상·저장소·LLM 어댑터
src/demo/                      합성 데이터·데모 전용 화면 데이터
tests/unit/                    순수 규칙·권한 판단
tests/integration/             실제 테스트 PostgreSQL·거래·관계
tests/e2e/                     브라우저 사용자 흐름
tests/support/                 시드·시간·계정·어댑터 테스트 지원
docs/operations/               결정 기록·장애·배포·보관·정책
```

페이지 목록은 설계안 §7을 그대로 따른다. 라우트가 보인다고 서버 업무 로직이 구현된 것으로 보지 않는다. 데모 셸과 실제 인증 셸은 분리한다.

## 공통 계약: 하위 계획이 공유하는 타입

P1-01에서 `src/contracts/domain.ts`, P2-01에서 `src/server/context.ts`, `src/server/errors.ts`로 구체화한다. 문자열 ID는 각 엔티티 키이며 클라이언트 입력은 런타임 검증한다.

```ts
import type { PrismaClient } from '../generated/prisma/client';
type DbClient = PrismaClient;
type Actor = { userId: string };
type AcademyRole = 'owner' | 'instructor';
type Subject = 'english' | 'math';
type Level = 'beginner' | 'intermediate' | 'advanced';
type SearchInput = {
  subject?: Subject; grade?: number; level?: Level;
  maxPriceWon?: number;
  availableWindows?: { startsAt: string; endsAt: string }[];
  cursor?: string;
};
type PublicOffering = {
  id: string; academyId: string; title: string; subject: Subject;
  gradeMin: number; gradeMax: number; level: Level;
  priceWon: number; availableSeats: number;
  sessions: { id: string; startsAt: string; endsAt: string }[];
};
type SearchResult = { items: PublicOffering[]; nextCursor: string | null };
type Recommendation = { offering: PublicOffering; score: number; reasons: string[] };
type AppErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'VALIDATION' | 'CONFLICT' | 'SOLD_OUT' | 'EXPIRED' | 'PROVIDER_UNAVAILABLE';
type Outcome<T> = { ok: true; value: T }
  | { ok: false; code: AppErrorCode };
type ServiceContext = {
  actor: Actor; now: () => Date;
  db: DbClient;
};
```

P2-01에서 Prisma 생성 출력 경로를 `src/generated/prisma`로 고정해 위 타입 import를 맞춘다. P1 단계의 순수 도메인 타입에서는 DB 관련 타입을 분리하고 P2에서 서버 파일에만 추가한다. DB 인스턴스는 브라우저 번들로 내보내지 않는다. 인증 어댑터가 검증한 Actor만 context를 생성한다. API 오류는 401/403/404/422/409/503으로 매핑하고 권한 없는 리소스의 존재를 누설하지 않는다. 원인·요청 ID는 서버에 기록하되 개인정보는 마스킹한다.

## 테스트 도구 계약

P1-01에서 `npm run typecheck`, `lint`, `build`, `test:unit`, `test:e2e`를, P2-01에서 `test:integration`, `db:migrate:test`를 만든다. Vitest 명령은 경로 인수를 받을 수 있게 한다. Playwright는 실행 전 앱을 띄우며 대상 포트는 3000이다.

P2-01에서 `tests/support/database.ts`에 다음을 만든다. 테스트 전용 DB URL만 허용하고 운영 URL은 거부한다. 통합 테스트는 파일별 DB/schema를 격리하고 종료 시 해제한다. 아래 `seedScenario`는 명시한 옵션만 받으며 향후 사용 필드를 여기서 함께 정의한다.

```ts
type ScenarioInput = { capacity?: number; academyStatus?: 'approved' | 'submitted' };
type Scenario = {
  owner: Actor; otherOwner: Actor; teacher: Actor; otherTeacher: Actor;
  parent: Actor; otherParent: Actor; student: Actor;
  studentId: string; otherStudentId: string; academyId: string;
  offeringId: string; sessionId: string;
};
// createTestDatabase(): Promise<{ db: DbClient; close(): Promise<void> }>
// seedScenario(db: DbClient, input?: ScenarioInput): Promise<Scenario>
// makeContext(db: DbClient, actor: Actor, now?: Date): ServiceContext
```

`seedScenario`는 2개 학원·서로 다른 소속 강사·보호자·학생을 만든다. parent는 studentId에만 연결, otherParent는 otherStudentId에만 연결. offering/session은 academyId 소속이고 teacher만 담당한다. 기본 capacity=2, 시작 시각은 2030-01-01T01:00:00Z, 종료는 02:00:00Z, 가격 100000원. 결제·수강권은 미생성이다. 고정 시각으로 테스트하고 현재 날짜에 의존하지 않는다.

모든 통합 테스트 파일에서 Vitest beforeEach/afterEach로 DB와 시나리오를 만들고 닫는다. 아래 하위 계획 예제의 `db`, `s`, `ctx`는 이 훅으로 생성한다. `ctx`는 parent context이고 시간은 2029-12-31T00:00:00Z다. 학생·강사 요청은 해당 Actor로 별도 context를 만든다.

테스트 예제의 `it`, `expect`, `beforeEach`, `afterEach`는 Vitest에서 import하고 서비스·fixture는 각 Task의 명시 경로에서 import한다. `canReadStudent`는 학생 프로필의 최소 범위 확인이며 해당 학생의 모든 학원 기록 열람을 뜻하지 않는다. 학습 조회 서비스는 반드시 offeringId·담당 강사·해당 수강권까지 제한한다.

## 구현 공통 절차

각 Task의 코드 블록은 테스트와 핵심 로직의 구현 기준이다. 테스트 지원 코드와 타입도 해당 Task의 명시 파일에 구현한다. 동작을 하드코딩하거나 테스트에서 호출 대상 서비스 자체를 mock 처리하지 않는다.

1. 제시한 실패 테스트를 작성하고 지정 명령으로 FAIL을 확인한다. 초기 import 실패는 첫 RED로 허용하되 실제 의미 있는 단언도 유지한다.
2. 타입·데이터·서비스와 라우트·화면을 구현한다. 입력 검증, 권한 검사, 오류 매핑을 연결한다.
3. 동일 테스트의 PASS 확인 후 관련 통합/E2E·typecheck를 실행한다.
4. gstack review 기준으로 변경을 자체 점검하고 통과 근거를 기록한다.
5. 구현 때 작업 브랜치 `codex/eduon-mvp`를 생성하고 명시 파일만 stage한다. 사용자 삭제 파일을 실수로 묶지 않는다. 같은 경로의 재생성은 의도된 새 구현인지 diff 확인 후 stage한다. `git add .`, reset/clean 금지.

## 외부 의존성과 결정 시점

| 결정 | 앞서 수행할 작업 | 막히는 작업 | 로컬에서 계속 가능한 작업 |
| --- | --- | --- | --- |
| 인증·학생 연령·보호자 확인 | P2-02에서 공식 기능·비용·관계 검증 방법 제시 후 선택 | 실제 가입·실사용자 수집 | 합성 계정 권한 테스트 |
| 수수료·환불·판매/정산 계약 | P3-01 전에 정책 버전·판매자 책임 결정 | 실결제·자동 환불 적용 | 테스트 전용 정책으로 거래 테스트 |
| PG·화상·메일·파일 저장소 | 해당 어댑터 Task에서 공급자 기능·키·비용 확인 | 실제 공급자 계약 테스트 | 메모리/로컬 어댑터의 계약 테스트 |
| 배포·보관·삭제·동의 | P4-04 전 결정 기록 | 운영 배포·실데이터 수집 | 스테이징 합성 데이터 검증 |

승인되지 않은 값은 `DEMO_MODE=true`에서만 사용한다. 운영 시작 시 provider 종류·정책 버전·비밀키가 빠져 있거나 demo adapter이면 부팅/기능 활성화를 거부한다. 공급자 확정 전 모의 테스트를 ‘실제 연동 완료’로 보고하지 않는다.

## NOT in scope

고급 AI 튜터·학습 요약은 데이터 축적 후 별도 계획, 자체 화상/녹화는 인프라 부담으로 제외, 구독·광고·자료 판매는 핵심 거래 검증 이후, 자동 정산 송금은 계약·자금 흐름 확정 이후로 분리한다. 현재 문서 작업에서 실제 배포·구매·외부 메시지 발송은 하지 않는다.

## gstack 기준 자체 계획 검토

| 축 | 계획에 반영한 처리 | 실행 시 확인 |
| --- | --- | --- |
| Architecture | 단일 앱·업무별 서비스, 정원 잠금, 외부 호출은 트랜잭션 밖 | P2~P3 실제 DB 테스트 |
| Code quality | 공통 오류·context·권한, provider 계약, 데모 분리 | Task별 타입 검사·코드 review |
| Tests | 마지막 좌석 경합·타 학원 접근·역순 웹훅·환불 실패, E2E | 하위 계획의 RED/GREEN |
| Performance | 결과 20개 커서 페이지, 필요한 필드만 select, 외래키/조회 인덱스 | P4-04 EXPLAIN·응답 측정 |
| Design | 5개 폭·상태별 화면·역할별 우선순위 | P1-03 및 P4-04 화면 QA |

검토 중 보완: 외부 결제 호출을 좌석 잠금 안에서 하지 않기, 만료 결제 보상 환불의 영속 작업, 부분 환불의 회차별 접근 범위, 부트 시 데모 차단을 Task에 명시했다. 코드가 없어 실제 결함 검증이나 성능 통과를 주장하지 않는다. 정식 대화형 gstack plan-eng-review와 외부 모델 리뷰는 완료하지 않았다.

## 요구사항 추적

| 설계안 요구 | 작업 |
| --- | --- |
| §1~4 범위·프로토타입 | P1-01~03, P4-04 |
| §5 신원·권한·자녀 | P2-01~03, P3-01, P4-01~03 |
| §6~7 공개/역할별 화면 | P1-02~03, 이후 각 업무 Task의 실제 연결 |
| §8~9 구조·데이터 | P2-01, 이후 모듈별 마이그레이션 |
| §10 좌석·결제·환불 | P3-01~04 |
| §11 학습·화상·자료 | P4-01~02 |
| §12 추천 | P2-04, 선택 LLM은 P4-03 |
| §13 반응형·상태 | P1-03, P4-04 |
| §14~15 CI·출시·지표 | P1-01, P4-03~04 |
| §16 공급자·정책 | 결정표 및 P2-02/P3-01/P4-04 |

## GSTACK REVIEW REPORT

| Review | Status | 근거 |
| --- | --- | --- |
| Eng criteria self-check | 계획 작성자가 적용 | Architecture/Code quality/Tests/Performance 검토, 위 보완 반영 |
| Formal plan-eng-review | NOT RUN | 별도 대화형 검토 미실행 |
| Design criteria self-check | 계획 작성자가 적용 | DESIGN.md와 상태·반응형 요구 추적 |
| Code / browser QA | NOT RUN | 현재 제품 코드·실행 앱 없음 |

**VERDICT:** 상세 계획 작성 완료. P1 로컬 프로토타입부터 실행 가능한 순서로 정리. 실제 운영 연동은 아래 결정과 검증을 통과해야 한다.

**UNRESOLVED DECISIONS:**
- 초기 모집 학년·보호자 확인·인증 제공자: P2-02 전.
- 결제/환불/수수료 정책·PG 계약: P3-01 실제 연동 전.
- 화상·파일·메일 공급자, 보관·삭제·동의·배포 정책: 해당 연동 및 P4-04 전.
