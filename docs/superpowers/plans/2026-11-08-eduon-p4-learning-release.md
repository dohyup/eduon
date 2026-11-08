# EDUON P4 Learning and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 수업 참여·강사 학습 운영·학부모 확인을 연결하고 시범 운영 출시 기준을 검증한다.
**Architecture:** 입장과 파일 다운로드도 서버 권한을 재검사하며, 학습 기록은 담당 수업에 한정한다. 외부 장애는 복구 경로를 제공한다.
**Tech Stack:** 이전 계획 스택 + 선택한 화상/저장소 + 선택적 LLM, Playwright/axe-core.
**Spec:** `../specs/2026-11-08-eduon-mvp-design.md` §11~16 및 마스터 계획.

## Global Constraints

마스터 Global Constraints·합성 시나리오 훅을 적용한다. 학생 입장은 시작 10분 전~종료 10분 후, 녹화 기본 비활성. 보호자는 결제 내역·연결된 자녀 현황만 조회한다. 실제 공급자가 없으면 프로덕션 연동 완료로 보고하지 않는다.

## Task P4-01: 수업 입장·일정·출결

**Files — Create:** `src/integrations/video/port.ts`, `src/integrations/video/provider.ts`, `src/modules/learning/join.ts`, `src/modules/learning/attendance.ts`, `src/modules/learning/completion.ts`, `src/app/api/sessions/[id]/join/route.ts`, `src/app/api/sessions/[id]/attendance/route.ts`, `tests/integration/join.test.ts`, `tests/integration/attendance.test.ts`, `tests/e2e/classroom.spec.ts`. **Modify:** 학생/강사/학부모 화면, 학습 모델 migration.

**Interfaces:** `requestJoin(ctx, sessionId: string): Promise<Outcome<{ joinUrl: string; expiresAt: string }>>`; `recordAttendance(ctx, { sessionId, studentId, status: 'present' | 'absent' | 'late', reason }): Promise<Outcome<void>>`; `completeOffering(sys, offeringId): Promise<void>`. `VideoPort.createJoin({ sessionId, participantId, expiresAt }): Promise<{ joinUrl: string }>`는 실제 수강권 검사 후에만 호출한다.

- [ ] 취소 수강권·타 학생·미배정 강사·시간창 밖 입장 거부 테스트를 작성해 `npm run test:integration -- tests/integration/join.test.ts` RED 확인한다. `payOrder`로 활성화 후 전체 환불한 테스트 fixture를 `tests/support/learning.ts`에 만든다.

```ts
it('결제만 한 학부모가 학생 입장권을 받지 않는다', async () => {
  const order = await createOrder(ctx, {
    studentId: s.studentId, offeringId: s.offeringId, requestKey: 'join',
  });
  if (!order.ok) throw new Error(order.code);
  await payOrder(systemContext(db), order.value.orderId);
  const parentAtClass = makeContext(db, s.parent, new Date('2030-01-01T00:55:00Z'));
  expect(await requestJoin(parentAtClass, s.sessionId))
    .toEqual({ ok: false, code: 'FORBIDDEN' });
});
```

- [ ] 실제 제공자의 개별 입장/대기실/인증 참가 지원을 기록하고 결정한다. 학생은 계정 바인딩·유효 회차 권리·시간창 검사, 강사는 실제 담당 여부 검사 후 다른 역할의 입장권을 발급한다. 결과 URL은 로그·공개 HTML·API 목록에 노출하지 않고 허용 호스트를 검증한다. 링크 전달 방지가 제공자 한계이면 잔여 위험과 운영 수용 여부를 기록한다.
- [ ] 강사 출결은 회차+학생 고유, 수정 사유/작성자/시각, 미래 회차 잘못 입력 차단. 접속을 자동 출석으로 바꾸지 않는다. 보호자 조회는 확인 관계를 검사한다. 종료 후 회차 기록을 보존하며 completion 작업은 중복 실행 안전하게 수강 완료를 반영한다.
- [ ] 실제 공급자 입장 sandbox/테스트 계정, 외부 장애 안내·연락·재일정, 출결 누락 UX를 검증한다. GREEN/typecheck와 `npm run test:e2e -- tests/e2e/classroom.spec.ts` 확인 후 `feat: connect secure classrooms and attendance`로 커밋한다.

## Task P4-02: 학습 자료·과제·제출·피드백

**Files — Create:** `src/integrations/storage/port.ts`, `src/integrations/storage/provider.ts`, `src/modules/learning/materials.ts`, `src/modules/learning/assignments.ts`, `src/app/api/materials/route.ts`, `src/app/api/materials/[id]/download/route.ts`, `src/app/api/assignments/route.ts`, `src/app/api/assignments/[id]/submissions/route.ts`, `src/app/api/submissions/[id]/feedback/route.ts`, `tests/integration/material-access.test.ts`, `tests/integration/assignments.test.ts`, `tests/e2e/assignment.spec.ts`. **Modify:** 학생/강사/학부모 수업 화면와 관련 migration.

**Interfaces:** `createAssignment(ctx, { offeringId, title, instructions, dueAt }): Promise<Outcome<{ assignmentId: string }>>`; `submitAssignment(ctx, { assignmentId, text, fileIds: string[] }): Promise<Outcome<{ submissionId: string }>>`; `getMaterialDownload(ctx, materialId): Promise<Outcome<{ url: string }>>`; `saveFeedback(ctx, { submissionId, text }): Promise<Outcome<void>>`.

- [ ] 테스트 지원 `seedAssignment(db, s): Promise<{ assignmentId: string; materialId: string }>`를 tests/support/learning.ts에 추가한다. 학습 권한 없이 쓰기/자료 열람 불가 테스트를 작성하고 `npm run test:integration -- tests/integration/assignments.test.ts` RED 확인.

```ts
it('보호자는 학생 과제를 대신 제출하지 않는다', async () => {
  const a = await seedAssignment(db, s);
  expect(await submitAssignment(ctx, {
    assignmentId: a.assignmentId, text: '답안', fileIds: [],
  })).toEqual({ ok: false, code: 'FORBIDDEN' });
});
```

- [ ] 담당 강사 작성·본인 학생 제출·교사 피드백·보호자 읽기 권한을 분리한다. 텍스트 10000자, 파일 수 5개, 개별 10MB의 초기 제한을 서버에서 검증한다. PDF/PNG/JPEG 허용, MIME+확장자+파일 서명 검증, 업로드 quarantine→검사 완료→사용 가능 흐름. 안전 검사 미연동 파일은 공개하지 않는다.
- [ ] StoragePort의 비공개 upload/signDownload/delete 계약을 구현한다. 파일 키는 서버가 생성하고 임의 key 입력을 막는다. 다운로드 URL은 60초 만료, 권한 없는 사용자는 URL 발급 거부. 파일 접근·교체·삭제 작업도 감사하고 늦은 제출은 rejected 대신 late 상태로 명확히 표시한다. 재제출은 버전 이력을 보존한다.
- [ ] 다른 학원 파일·다른 학생 제출 수정·위장 MIME·미검사 파일·기한 경계·업로드 실패 재시도·강사 피드백 보호자 열람 E2E를 검증해 GREEN 확인 후 `feat: add private learning materials and assignments`로 커밋한다.

## Task P4-03: 후기·재수강·운영 지표·선택적 AI 설명

**Files — Create:** `src/modules/learning/reviews.ts`, `src/modules/learning/reenroll.ts`, `src/modules/learning/summary.ts`, `src/modules/analytics/events.ts`, `src/integrations/llm/port.ts`, `src/modules/recommendations/explain.ts`, `src/app/api/reviews/route.ts`, `src/app/api/reviews/[id]/report/route.ts`, `src/app/api/reenrollment/route.ts`, `src/app/api/admin/reports/[id]/resolve/route.ts`, `tests/integration/reviews.test.ts`, `tests/unit/recommendation-explanation.test.ts`, `tests/e2e/reenrollment.spec.ts`. **Modify:** 상세/학생/학부모/운영자 화면·Review/Report/Event migrations.

**Interfaces:** `createReview(ctx, { enrollmentId, rating, text }): Promise<Outcome<{ reviewId: string }>>`; `startReenrollment(ctx, { enrollmentId, nextOfferingId, requestKey }): ReturnType<typeof createOrder>`; `getLearningSummary(ctx, studentId): Promise<Outcome<{ attendanceCount: number; pendingAssignments: number }>>`; `explainRecommendations(items: Recommendation[], llm?: LlmPort): Promise<Recommendation[]>`.

- [ ] 완료 수강권의 학생 또는 해당 주문 보호자만 작성 가능, 수강권당 후기 1개, 중복·연결 해제 보호자 거부를 테스트한다. 아래를 `npm run test:unit -- tests/unit/recommendation-explanation.test.ts`로 RED 확인.

```ts
it('AI 장애에도 규칙 기반 결과가 유지된다', async () => {
  const items = rankOfferings(demoOfferings, { subject: 'math' });
  const llm: LlmPort = { explain: async () => { throw new Error('timeout'); } };
  expect(await explainRecommendations(items, llm)).toEqual(items);
});
```

- [ ] 후기 평점 1~5·텍스트 2000자 제한, 신고→운영 검토→사유와 함께 숨김 처리. 허위 후기를 시드 실적으로 사용하지 않는다. 재수강은 같은 Course의 새 공개 Offering을 선택해 확인된 자녀·정원·현재 가격을 재검증하고 새 주문을 만든다. 이전 결제나 수강권 재사용 금지.
- [ ] 학습 현황은 출결·미제출 과제 등 DB 사실만 요약한다. 생성형 학습 리포트는 이 계획 범위에서 제외한다. 전환 이벤트는 검색→상세→신청→paid→첫 참여→재수강으로 구분하고 고유 키로 중복을 제거한다. 집계는 학원 범위 적용·개인정보 최소화, 운영자만 전체 조회한다.
- [ ] 선택적 LLM은 `LlmPort.explain({ candidates: {id, publicFacts}[] }): Promise<{ id: string; reasons: string[] }[]>`만 제공한다. 3초 제한·사용량 제한·구조/ID/가격 검증·학생 이름 제거·인젝션 방어를 적용한다. 키가 없으면 규칙 설명 유지, 이 옵션 미연동은 출시 차단 사항이 아니다.
- [ ] 비수강 후기·완료 전 후기·다른 자녀 재수강·변경 가격·AI 허구 ID/가격·장애 테스트와 E2E를 GREEN 확인 후 `feat: add verified reviews and reenrollment`로 커밋한다.

## Task P4-04: 전체 QA·성능·운영 준비와 시범 출시 판정

**Files — Create:** `tests/e2e/full-journey.spec.ts`, `tests/e2e/security-boundaries.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/support/e2e-identity.ts`, `src/app/api/orders/[id]/route.ts`, `src/app/api/health/route.ts`, `docs/operations/release-checklist.md`, `docs/operations/backup-restore.md`, `docs/operations/incident-runbook.md`, `docs/operations/privacy-retention.md`, `docs/operations/provider-contracts.md`, `docs/operations/final-qa.md`, `docs/operations/performance.md`. **Modify:** CI·README·필요한 오류 경로 및 내부 health 서비스.

**Interfaces:** `/api/health`는 공개 응답에 연결 문자열/개인정보를 포함하지 않는 생존 상태만 제공, 상세 DB/queue/provider 준비 상태는 인증된 내부 관측 경로로 분리. provider readiness는 데모 여부·필수 정책·키 구성 유효성을 검사한다. `tests/support/e2e-identity.ts`는 Playwright `test.extend`로 로그인된 otherParent의 `request`와 parent 소유의 `orderId: string` fixture를 제공한다. 이 파일이 export한 test/expect를 아래 테스트에서 import한다.

- [ ] full-journey에서 원장 신청 → 운영자 승인 → 수업 개설 → 학부모 자녀 선택/결제 → 학생 입장 → 강사 출결/과제/피드백 → 보호자 확인 → 후기/재수강을 작성한다. 아래 보안 E2E RED를 확인한다. 계정 세션 fixture는 P2의 실제 인증 테스트 지원으로 제공하며 production에 테스트 로그인 엔드포인트를 배포하지 않는다.

```ts
test('다른 보호자는 주문을 읽지 못한다', async ({ request, orderId }) => {
  const res = await request.get(`/api/orders/${orderId}`);
  expect([403, 404]).toContain(res.status());
});
```

- [ ] 누락된 `/api/orders/[id]` GET 라우트를 추가해 getOrder 권한 계약을 연결한다. 마지막 좌석 동시 신청·웹훅 중복/역순·PG timeout·부분 환불 입장·초대 만료·강사 해임·자녀 연결 해제 시 기존 세션 권한 갱신을 전체 회귀 검증한다.
- [ ] 5개 폭에서 로딩/빈 화면/권한 없음/확인 중/오류·재시도, 키보드/axe/대비/포커스를 검증한다. gstack review·qa·design-review를 현재 실행 가능 도구로 수행하며, browse 실패 시 Playwright 대체와 한계를 기록한다. 테스트 서버/브라우저는 검증 후 정리한다.
- [ ] 실제 스테이징에서 검색 1000개 합성 기수·조회 20개를 기준으로 검색 p95 1초 이내를 초기 성능 목표로 측정한다. 결제/입장 시간은 외부 제공자 시간을 분리한다. 검색·학생 목록의 SQL EXPLAIN, N+1·외래키 인덱스·connection pool을 점검한다. 목표는 측정 전 달성했다고 쓰지 않는다.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run build`, `npm run test:e2e`를 실행한다. 키 없는/데모 구성으로 운영 모드 시작이 차단되는지 확인한다. 실제 PG·화상·메일·저장소 계약 검증은 fake 결과와 별도 증거로 기록한다.
- [ ] 보관/삭제/동의 정책·PG 판매/정산 책임·백업 복구·migration 복구·비밀키 로테이션·장애 경보·재처리·롤백·배포 환경을 문서화한다. 운영 데이터 수집 전 정책 검토와 공급자 선택이 완료되어야 한다. preview에는 합성 데이터만 사용한다. 초기 사용자 관찰은 원장 3명·학부모 3명 제안이며 모집/연락은 사용자 지시 없이 실행하지 않는다.
- [ ] QA에서 발견한 오류를 수정한 후 영향 테스트를 재실행하고 최종 보고서에 명령/결과/실행일/미해결 이슈/제공자별 검증 여부를 기록한다. 명시 파일만 `test: verify eduon pilot readiness`로 커밋한다. 실제 운영 배포는 구체적인 staging 결과와 비용을 제시하고 사용자 배포 지시를 받은 후 수행한다.

## P4 완료 기준

P1~P4의 검증 결과와 실제 공급자 계약 검증, 정책·운영 관문을 모두 확인한 경우만 운영 MVP 출시 준비 완료다. 화면만 완성됐거나 테스트 더블만 통과한 경우에는 정확한 단계와 남은 연동을 보고한다. 실제 운영 배포 성공과 출시 준비 완료는 구분한다.
