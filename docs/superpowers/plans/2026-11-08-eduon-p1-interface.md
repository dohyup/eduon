# EDUON P1 Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 합성 데이터로 공개 탐색과 역할별 업무를 확인하는 반응형 프로토타입.
**Architecture:** 서버 데이터 계약과 분리된 demo repository를 사용하고 모든 데모 화면에 상태를 표시한다.
**Tech Stack:** Next.js/TypeScript/Tailwind, Vitest, Testing Library, Playwright, axe-core. 버전은 Task 01에서 고정.
**Spec:** `../specs/2026-11-08-eduon-mvp-design.md`, 루트 `DESIGN.md`.

상태: **2026-11-09 P1 기능 구현·검증 완료.** 단위 15개, 프로덕션 서버 E2E 24개 통과. 커밋 단계는 기존 root app 삭제와 src/app 추가의 통합 정리가 필요해 자동 수행하지 않았다. 근거: `../../operations/p1-qa.md`.

## Global Constraints

마스터 계획의 Global Constraints·공통 계약·커밋 절차를 모두 적용한다. 실제 로그인·결제·수업이 아님을 표시하고 외부 키 없이 실행한다. 기본 합성 시드는 대구의 가상 학원 2곳·영어/수학 6개 모집기수이며 기관·인물은 실존 이름을 사용하지 않는다.

## Task P1-01: 앱 기반과 검증 환경

**Files — Create:** `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/contracts/domain.ts`, `vitest.config.ts`, `playwright.config.ts`, `tests/e2e/home.spec.ts`, `.github/workflows/ci.yml`, `README.md`, `docs/operations/dependencies.md`.

**Interfaces:** Produces 마스터 공통 도메인 타입과 검증 스크립트. `test:unit`은 `vitest run tests/unit`, `test:e2e`는 `playwright test`, `typecheck`는 `tsc --noEmit`, `lint`는 `eslint .`, `build`는 `next build`로 정의. Vitest는 경로 인수 추가를 지원해야 한다.

- [x] 공식 Next.js/React/Node/Tailwind 및 테스트 도구 요구사항을 확인하고 서로 호환되는 안정 버전을 기록한다. `npm view next version engines peerDependencies --json`, `npm view prisma dist-tags engines --json` 결과와 공식 문서를 비교한다. RC/canary는 선택하지 않는다. 선택한 숫자 버전과 lockfile을 저장하고 `npm ci` 재현성을 확인한다.
- [x] 실행 브랜치를 준비하고 기존 삭제 diff를 기록한다. 테스트 환경을 설치한 뒤 아래 테스트를 작성해 `npm run test:e2e -- tests/e2e/home.spec.ts`의 RED를 확인한다.

```ts
import { test, expect } from '@playwright/test';
test('공개 홈에서 수업 탐색을 시작한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('우리 아이');
  await expect(page.getByRole('link', { name: '수업 찾기', exact: true }).first())
    .toHaveAttribute('href', '/classes');
});
```

- [x] globals.css에 DESIGN.md 토큰을 CSS 변수로 선언하고 루트 lang=ko, skip link, 헤더/본문/footer를 구현한다. `.env.example`에는 값 없는 키와 `DEMO_MODE=true`만 쓰고 비밀키를 만들지 않는다. CI는 npm ci → typecheck → lint → build → E2E smoke 순서로 구성한다.
- [x] 동일 E2E PASS와 `npm run typecheck`, `npm run lint`, `npm run build`를 확인한다. 초기 프로젝트 설정을 검증하기 위해 구현을 그대로 복제한 단위 테스트는 추가하지 않는다.
- [ ] 명시한 파일만 diff 확인·stage 후 `chore: initialize eduon web foundation`으로 커밋한다. README에 실행·데모 범위·새 테스트 명령을 기록한다.

## Task P1-02: 공개 수업 탐색과 상세

**Files — Create:** `src/demo/catalog.ts`, `src/demo/search.ts`, `src/components/ui/button.tsx`, `src/components/ui/field.tsx`, `src/components/ui/status.tsx`, `src/components/catalog/offering-card.tsx`, `src/app/classes/page.tsx`, `src/app/classes/[id]/page.tsx`, `src/app/academies/[id]/page.tsx`, `src/app/teach/page.tsx`, `tests/unit/demo-search.test.ts`, `tests/e2e/catalog.spec.ts`. **Modify:** `src/app/page.tsx`.

**Interfaces:** `searchDemoOfferings(input: SearchInput): SearchResult`; fixture `demoOfferings: PublicOffering[]`. 타입은 마스터의 공통 계약을 사용한다. 공개 카드에는 내부 명단·입장 URL·개인정보를 포함하지 않는다.

- [x] 다음 테스트를 `tests/unit/demo-search.test.ts`에 작성하고 `npm run test:unit -- tests/unit/demo-search.test.ts`로 RED를 확인한다.

```ts
import { expect, it } from 'vitest';
import { searchDemoOfferings } from '../../src/demo/search';
it('예산을 넘는 수업을 추천하지 않는다', () => {
  const result = searchDemoOfferings({ subject: 'math', maxPriceWon: 1 });
  expect(result.items).toEqual([]);
});
```

- [x] 한 행동씩 구현: 합성 데이터 → URL 검색 파라미터 검증 → 필터 → 결과 카드 → 상세 → 학원 소개 → 입점 안내. 입력 가격은 정수·0 이상, 학년은 1~12, 잘못된 ID는 404로 처리한다. 서버 가격을 흉내 내는 입력 변경은 데모에서도 표시하지 않는다.
- [x] `tests/e2e/catalog.spec.ts`에서 `/classes?subject=math` → 첫 상세 → 학원 확인, 검색 결과 없음 → 필터 초기화를 검증한다. 신청 버튼은 ‘데모 신청 안내’를 열고 결제 성공으로 이동시키지 않는다.
- [x] 단위 테스트와 `npm run test:e2e -- tests/e2e/catalog.spec.ts`, typecheck·lint를 실행한다. 정상·빈 결과·잘못된 파라미터·없는 상세 ID를 확인한다.
- [ ] 위 파일만 stage 후 `feat: add demo course discovery`로 커밋한다.

## Task P1-03: 역할별 화면과 반응형 QA

**Files — Create:** `src/components/layout/public-header.tsx`, `src/components/layout/workspace-shell.tsx`, `src/components/ui/dialog.tsx`, `src/demo/workspaces.ts`, `src/app/parent/page.tsx`, `src/app/parent/children/page.tsx`, `src/app/parent/orders/page.tsx`, `src/app/learn/page.tsx`, `src/app/learn/classes/[id]/page.tsx`, `src/app/academy/page.tsx`, `src/app/academy/classes/page.tsx`, `src/app/academy/students/page.tsx`, `src/app/academy/finance/page.tsx`, `src/app/instructor/page.tsx`, `src/app/instructor/classes/[id]/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/academies/page.tsx`, `src/app/admin/payments/page.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/onboarding/page.tsx`, `tests/e2e/responsive.spec.ts`, `docs/operations/p1-qa.md`.

**Interfaces:** `WorkspaceShell({ role, children })`, role는 `parent | student | owner | instructor | admin`. 데모 역할 전환은 production 인증 경로와 분리한다. 이후 P2에서 각 라우트의 데이터 접근을 서버 guard와 연결한다.

- [x] `tests/e2e/responsive.spec.ts`에 아래 실패 테스트를 작성한다. `npm run test:e2e -- tests/e2e/responsive.spec.ts`로 RED 확인.

```ts
import { test, expect } from '@playwright/test';
for (const width of [360, 390, 768, 1024, 1440]) {
  test(`학부모 화면 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/parent');
    await expect(page.getByText('다음 수업', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  });
}
```

- [x] 학부모의 자녀 선택·다음 수업, 학생의 입장·과제, 원장의 오늘 수업·신청/환불, 강사의 출결, 운영자의 입점 심사 화면을 합성 데이터로 연결한다. 로그인 폼은 데모 안내만 제공한다. 모든 데모 화면에는 ‘데모 · 실제 결제 및 수강 불가’가 보이게 한다.
- [x] 필터 시트·모바일 메뉴·다이얼로그의 ESC/포커스 복귀를 구현하고 loading/empty/error/pending 상태를 합성 시나리오로 제공한다. 테스트에 axe 검사와 메뉴 키보드 탐색을 추가한다. DESIGN.md의 대비를 실제 색 조합으로 측정한다.
- [x] 반응형/E2E/typecheck/lint/build 실행 후 gstack browse 실행 가능성을 먼저 확인한다. 실패하면 Playwright로 화면·키보드 QA하고 대체 사실을 기록한다. gstack design-review 기준으로 홈·상세·학부모·학생·원장 화면 스크린샷을 점검한다. 보고서에 확인한 폭·상태·남은 문제를 기록한다.
- [ ] 위 파일과 QA 보고서만 stage 후 `feat: add responsive role workspaces`로 커밋한다.

## P1 완료 기준

공개 검색부터 역할별 업무를 확인할 수 있고 5개 폭에서 가로 넘침·키보드 핵심 장애가 없다. mock 인증을 실제 인증으로, 데모 입장을 화상 연동으로 보고하지 않는다. 제품 코드는 여기서 처음 생긴다. 다음 P2에 앞서 인증·학생 연령·보호자 확인 결정을 진행한다.
