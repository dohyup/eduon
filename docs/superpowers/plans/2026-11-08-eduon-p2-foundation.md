# EDUON P2 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 DB·세션·학원 승인·자녀 연결·수업 공개와 조건 추천.
**Architecture:** 단일 서버 context에서 인증된 Actor와 DB를 주입하고 소속/관계/리소스를 매 요청 검증한다.
**Tech Stack:** P1에서 고정한 웹/테스트 스택 + 안정 Prisma/PostgreSQL + 선택한 인증 제공자.
**Spec:** `../specs/2026-11-08-eduon-mvp-design.md` §5~9·12 및 마스터 계획.

상태: **2026-11-09 코드·로컬 검증 완료, 실제 Supabase 연결 검증 대기.** 사용자 Supabase 선택 및 기존 프로젝트 .env.local 설정 예정. 결과: `../../operations/p2-qa.md`, 연결: `../../operations/p2-setup.md`. 완료 기준의 실제 제공자 검증은 아직 충족하지 않았으며 아래 체크리스트를 일괄 완료 처리하지 않는다.

## Global Constraints

마스터 Global Constraints를 적용한다. 실제 학생 정보 수집은 보호자 확인·가입 연령·동의 정책 결정 후에만 허용한다. 그 전 통합 테스트는 합성 데이터만 사용한다. 각 테스트 예제의 db/s/ctx는 마스터의 beforeEach/afterEach 계약으로 생성한다.

## Task P2-01: DB·테스트 격리·권한 기반

**Files — Create:** `prisma/schema.prisma`, `prisma/migrations/0001_identity_catalog/migration.sql`, `prisma.config.ts`, `compose.test.yml`, `src/server/db.ts`, `src/server/context.ts`, `src/server/errors.ts`, `src/server/audit.ts`, `src/server/config.ts`, `src/server/rate-limit.ts`, `src/modules/identity/access.ts`, `tests/support/database.ts`, `tests/support/scenario.ts`, `tests/support/context.ts`, `tests/integration/access.test.ts`. **Modify:** `package.json`, `.env.example`, `.github/workflows/ci.yml`.

**Interfaces:** `authorizeAcademy(ctx: ServiceContext, academyId: string, role: AcademyRole): Promise<Outcome<void>>`; `canReadStudent(ctx, studentId): Promise<Outcome<void>>`; 마스터의 테스트 DB/시나리오/context 함수. `appendAudit(ctx, { action, targetId, reason }): Promise<void>`. 오류는 AppErrorCode를 가진 Outcome으로 반환한다.

- [ ] 마스터 테스트 지원 계약을 구현하고, 테스트 전용 PostgreSQL 연결·마이그레이션 스크립트를 만든다. 운영과 다른 DB명 및 `NODE_ENV=test`를 요구한다. 테스트 DB 초기화는 해당 DB에만 한정한다.
- [ ] 아래를 작성하고 `npm run test:integration -- tests/integration/access.test.ts`로 RED 확인한다.

```ts
it('다른 학원 원장은 학생 내부 기록을 읽지 못한다', async () => {
  const result = await canReadStudent(makeContext(db, s.otherOwner), s.studentId);
  expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
});
```

- [ ] User/Academy/Membership/StudentProfile/GuardianLink/Course/Offering/Session/Assignment/AuditEvent 모델과 관계를 구현한다. Membership(academy,user), GuardianLink(guardian,student)의 중복을 막고 학원 소유 엔티티는 academyId와 부모 관계 일치를 DB 제약으로 검증한다. 외래키·소속 조회·공개 수업 검색 인덱스를 둔다. 삭제는 거래 기록 연쇄 삭제를 피한다.
- [ ] 서버 전용 db, context, audit를 구현한다. 공개 DTO는 필요한 필드만 선택한다. role enum만으로 전역 학생 열람을 허용하지 않는다. 페이지당 최대 20개 조회, 요청 크기/빈도 제한 저장소는 다중 인스턴스에서도 공유되게 설계한다. RLS 채택 여부는 운영 DB 역할과 함께 기록하고 서버 권한을 생략하지 않는다.
- [ ] 타 학원·타 자녀 거부와 본인/소속 허용 테스트, `db:migrate:test`, typecheck를 실행한다. CI PostgreSQL service를 연결하고 위 파일만 `feat: add tenant-scoped data access`로 커밋한다.

## Task P2-02: 실제 로그인·보호자·학생 연결

**Files — Create:** `src/integrations/auth/port.ts`, `src/integrations/auth/provider.ts`, `src/integrations/mail/port.ts`, `src/integrations/mail/provider.ts`, `src/modules/identity/guardian-links.ts`, `src/app/api/auth/[...auth]/route.ts`, `src/app/api/children/route.ts`, `src/app/api/guardian-invitations/route.ts`, `src/app/api/guardian-invitations/accept/route.ts`, `tests/integration/guardian-links.test.ts`, `tests/e2e/identity.spec.ts`, `docs/operations/identity-decisions.md`. **Modify:** 로그인·가입·온보딩·학부모/학생 페이지, `src/server/context.ts`, schema와 새 migration.

**Interfaces:** `getActor(request: Request): Promise<Actor | null>`; `issueStudentInvitation(ctx, studentId: string): Promise<Outcome<{ token: string }>>`; `acceptStudentInvitation(ctx, token: string): Promise<Outcome<{ studentId: string }>>`; `MailPort.sendInvitation({ recipient, url }): Promise<void>`. 초대 발급은 확인된 보호자만 가능하다.

- [ ] 인증 제공자·가입 연령·보호자 확인 선택을 문서화한다. 쿠키 기반 실제 세션, 서버 검증, 로그아웃·만료·계정 복구를 제공하는 검증된 라이브러리를 사용하고 자체 비밀번호 저장을 만들지 않는다. 미결정 시 합성 계정 통합 테스트만 진행하고 실제 로그인 완료로 표시하지 않는다.
- [ ] 아래 테스트를 작성해 `npm run test:integration -- tests/integration/guardian-links.test.ts` RED 확인.

```ts
it('학생 초대는 한 번만 수락된다', async () => {
  const issued = await issueStudentInvitation(ctx, s.studentId);
  if (!issued.ok) throw new Error(issued.code);
  const studentCtx = makeContext(db, s.student);
  expect((await acceptStudentInvitation(studentCtx, issued.value.token)).ok).toBe(true);
  expect(await acceptStudentInvitation(studentCtx, issued.value.token))
    .toEqual({ ok: false, code: 'CONFLICT' });
});
```

- [ ] 보호자가 새 자녀 프로필 생성 후 초대를 발급한다. 기존 학생 프로필 연결은 이름 검색으로 허용하지 않고 운영 확인/기존 확인 관계 동의로 제한한다. 토큰은 난수·해시 저장·24시간 만료·원자적 1회 소비, 계정 바인딩·폐기 기능을 구현한다. 만료·탈취·비소유자 발급 거부를 테스트한다.
- [ ] 실제 인증의 origin/CSRF 방어·안전한 쿠키·인증 속도 제한, 메일 실패 재발급 경로를 연결한다. 학생 연결이 임의 계정에 바뀌지 않는 E2E와 `test:integration` PASS를 확인한다. 계정별 민감정보가 공개 캐시에 남지 않는지 점검한다.
- [ ] 명시 파일만 `feat: connect guardian and student identities`로 커밋한다.

## Task P2-03: 학원 입점 승인·강사 소속·수업 개설

**Files — Create:** `src/modules/academies/service.ts`, `src/modules/academies/invitations.ts`, `src/modules/catalog/authoring.ts`, `src/app/api/academies/route.ts`, `src/app/api/academies/[id]/decision/route.ts`, `src/app/api/academies/[id]/invitations/route.ts`, `src/app/api/offerings/route.ts`, `src/app/api/offerings/[id]/publish/route.ts`, `tests/integration/academy-publish.test.ts`, `tests/e2e/academy-authoring.spec.ts`. **Modify:** academy/admin/instructor 실제 페이지와 필요한 migrations.

**Interfaces:** `submitAcademy(ctx, { name, region }): Promise<Outcome<{ academyId: string }>>`; `decideAcademy(ctx, { academyId, decision: 'approved' | 'rejected', reason }): Promise<Outcome<void>>`; `publishOffering(ctx, offeringId): Promise<Outcome<void>>`; `issueInstructorInvitation(ctx, { academyId, email }): Promise<Outcome<{ token: string }>>`. 플랫폼 운영자 여부는 DB에서 확인하고 공개 가입으로 부여하지 않는다.

- [ ] 아래 테스트로 `npm run test:integration -- tests/integration/academy-publish.test.ts` RED 확인.

```ts
it('심사 중인 학원은 모집을 시작하지 못한다', async () => {
  const pending = await seedScenario(db, { academyStatus: 'submitted' });
  expect(await publishOffering(makeContext(db, pending.owner), pending.offeringId))
    .toEqual({ ok: false, code: 'CONFLICT' });
});
```

- [ ] 제출/반려/재제출/승인/정지와 감사 이력을 구현한다. 담당 강사는 초대 수락 후 배정하고 타 학원 강사 배정을 차단한다. 초대는 해시·만료·한 번 소비 규칙을 재사용하되 보호자 연결 권한과 혼합하지 않는다.
- [ ] 강좌와 모집기수를 분리하고 과목·학년·수준·가격·정원·회차·담당 강사를 필수로 검증한다. 회차 종료>시작, 겹치는 담당 강사 시간표 충돌은 공개 거부, 첫 결제 후 가격/회차 직접 수정은 차단한다. P3 전에는 Enrollment 존재 여부 대신 Order 연결 계약을 마련하고 P3에서 실제 구매 제약을 검증한다.
- [ ] owner 개설 → admin 승인 → 공개 → 강사 조회 E2E와 타 학원 수정 403/404, 반려 사유 노출, 정지 학원 신규 공개 차단 테스트를 실행한다. 페이지에서 demo repository를 실제 service로 전환한다.
- [ ] 위 파일만 `feat: add academy onboarding and offering publication`으로 커밋한다.

## Task P2-04: 실제 검색·조건 추천

**Files — Create:** `src/modules/catalog/search.ts`, `src/modules/recommendations/rank.ts`, `src/modules/recommendations/service.ts`, `src/app/api/recommendations/route.ts`, `tests/unit/rank.test.ts`, `tests/integration/search.test.ts`. **Modify:** 수업 목록·상세·학원 공개 페이지와 RecommendationEvent migration.

**Interfaces:** `searchOfferings(input: SearchInput): Promise<SearchResult>`; `rankOfferings(items: PublicOffering[], input: SearchInput): Recommendation[]`; `recommend(ctx, input): Promise<Outcome<Recommendation[]>>`. 시간 조건이 있으면 모든 회차가 허용 시간창의 합집합 안에 들어야 한다.

- [ ] 아래로 `npm run test:unit -- tests/unit/rank.test.ts` RED 확인. fixture는 P1 demoOfferings를 사용하며 공급자/개인정보는 필요 없다.

```ts
it('예산 밖 후보와 매진 후보를 제외한다', () => {
  const result = rankOfferings(demoOfferings, { maxPriceWon: 1 });
  expect(result).toEqual([]);
});
```

- [ ] 공개·승인·모집기간·정원·과목·학년·수준·예산·가능시간을 하드 필터로 구현한다. 초기 정렬은 일정 적합·가격 적합·관련성, 동점은 offeringId로 안정 정렬한다. 규칙 버전 `rules-v1`과 실제 충족 조건을 reasons에 저장한다. 리뷰 수로만 순위를 정하지 않는다.
- [ ] 검색은 20개 커서 페이지, 추천은 최대 5개, 조건 없음/후보 없음/잘못된 시간 입력 UX를 구현한다. 조회 결과의 가격·잔여좌석은 참고이며 주문 생성에서 재검증한다.
- [ ] 통합 테스트로 비공개·정지 학원·다른 학년·닫힌 기수 노출 차단과 신규 학원 추천 가능성을 검증한다. 기존 catalog E2E를 실제 DB 시드로 전환하고 개인정보를 추천 기록에 넣지 않는지 검사한다.
- [ ] GREEN/typecheck/build 후 위 파일만 `feat: add verified course search and matching`으로 커밋한다.

## P2 완료 기준

실제 인증 제공자를 선택·검증한 경우에만 실제 로그인 완료로 보고한다. 학원/자녀/강사 범위를 서버에서 검사하고 공개 검색은 DB로 동작한다. 통합 테스트는 SQLite 대체가 아닌 PostgreSQL로 실행한다. 결제·수업 입장은 아직 완성되지 않았다.
