# EDUON · 배움이음터

소규모 학원의 온라인 전환과 학생의 수업 탐색을 연결하는 **P1 반응형 프로토타입과 P2 인증·학원 운영 기반**입니다.

## 실행

Node.js 24를 기준으로 검증합니다.

```sh
npm ci
npm run db:generate
npm run dev
```

브라우저: http://127.0.0.1:3000

```sh
npm run build
npm start
```

## 체험 경로

| 화면 | 경로 |
| --- | --- |
| 공개 홈 / 수업 탐색 | `/`, `/classes` |
| 수업 상세 / 가상 학원 | `/classes/math-1`, `/academies/academy-1` |
| 입점 안내 | `/teach` |
| 학부모 / 학생 | `/parent`, `/learn` |
| 원장 / 강사 / 운영자 | `/academy`, `/instructor`, `/admin` |
| 전체 역할 선택 | `/onboarding` |

기본 P2 모드는 실제 DB·인증 연동용입니다. `.env.local` 설정 전에는 연결 필요 안내를 표시합니다. [P2 연결 안내](docs/operations/p2-setup.md)를 따라 Supabase Auth와 PostgreSQL을 연결하세요.

P2는 서버 권한 검사, 자녀 등록·학생 초대, 학원 신청·심사·재신청, 강사 소속·수업 개설·공개와 DB 검색을 제공합니다. 실제 결제·화상수업은 아직 구현하지 않았습니다.

P1 데모가 필요하면 로컬 환경변수 `DEMO_MODE=true`로 실행합니다. 이 모드의 저장은 현재 페이지 메모리에만 남고 새로고침하면 초기화됩니다. 데모 모드에서는 실제 변경 API를 사용할 수 없습니다.

학원 2곳·수업 6개·각 수업 4회차는 모두 합성 데이터입니다. 로그인 화면은 역할별 체험 안내입니다. P1 데모에서는 실제 인증·DB를 사용하지 않습니다. P2에는 인증·DB 어댑터와 메일 연동 코드를 구현했으며 실제 외부 프로젝트 검증은 연결 후 수행합니다. AI 모델·결제·화상회의·파일 업로드는 연결하지 않았습니다. 개인정보를 입력하지 마세요.

## 검증

```sh
npx playwright install chromium
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run db:migrate:test
npm run build
npm run test:e2e
npm run test:e2e:p2
```

브라우저 테스트는 별도의 3100(P1)·3101(P2) 서버와 분리된 빌드·결과 디렉터리를 사용합니다. P2 테스트는 임시 PostgreSQL과 프로덕션에서 금지된 서명 테스트 세션을 사용합니다. 실제 Supabase/Resend 키를 테스트 서버에 전달하지 않습니다. 네트워크/프로세스 제한이 있는 환경에서는 로컬 서버와 Chromium 실행 권한이 필요합니다.

대표 화면 캡처: 서버 실행 후 `node scripts/qa-screenshots.mjs`.

## 문서

- `DESIGN.md`: 디자인 시스템
- `docs/superpowers/specs/2026-11-08-eduon-mvp-design.md`: 승인된 MVP 설계
- `docs/superpowers/plans/2026-11-08-eduon-mvp-implementation.md`: 단계별 계획
- `docs/operations/p1-qa.md`: P1 검증 결과·수정·한계
- `docs/operations/p2-qa.md`: P2 구현·검증·외부 연결 대기
- `docs/operations/p2-setup.md`: Supabase·DB·메일 설정
- `docs/operations/dependencies.md`: 버전·의존성 확인 근거

P1 합성 데이터는 `src/demo`, P2 업무 모듈은 `src/modules`, 서버·통합 어댑터는 `src/server`와 `src/integrations`에 분리되어 있습니다. CI는 타입·린트·단위·빌드·E2E를 실행하도록 구성했으며 원격 CI 실행은 별도입니다.
