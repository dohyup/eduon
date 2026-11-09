# EDUON · 배움이음터

소규모 학원의 온라인 전환과 학생의 수업 탐색을 연결하는 **P1 반응형 화면, P2 인증·학원 운영 기반, P3 수강·결제, P4 학습 운영의 내부 테스트 구현**입니다. 실제 시범 운영 출시는 제공자·정책·스테이징 검증이 남아 있습니다.

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

| 화면                  | 경로                                      |
| --------------------- | ----------------------------------------- |
| 공개 홈 / 수업 탐색   | `/`, `/classes`                           |
| 수업 상세 / 가상 학원 | `/classes/math-1`, `/academies/academy-1` |
| 입점 안내             | `/teach`                                  |
| 학부모 / 학생         | `/parent`, `/learn`                       |
| 원장 / 강사 / 운영자  | `/academy`, `/instructor`, `/admin`       |
| 전체 역할 선택        | `/onboarding`                             |

기본 실제 데이터 모드는 DB·인증 연동용입니다. `.env.local` 설정 전에는 연결 필요 안내를 표시합니다. [P2 연결 안내](docs/operations/p2-setup.md)를 따라 Supabase Auth와 PostgreSQL을 연결하세요.

P2는 서버 권한 검사, 자녀 등록·학생 초대, 학원 신청·심사·재신청, 강사 소속·수업 개설·공개와 DB 검색을 제공합니다. 실제 Supabase 로그인·로그아웃 검증 기록은 [P2 외부 연결 결과](docs/operations/p2-supabase-verification.md)에 있습니다.

P3는 좌석 예약·정책 스냅샷·중복 방지 주문, 결제 사실 검증 후 수강권 생성, 부분 환불, 만료·지연 결제 보상, 영속 재처리 작업과 정산 원장을 제공합니다. 사용자가 PG 선택을 보류하여 **격리된 테스트 환경에서만 가짜 결제 제공자**를 사용합니다. 실제 인증 모드·운영 빌드에서 가짜 결제를 실행할 수 없고, 미설정 공급자의 결제 API는 차단됩니다. 실제 Supabase에는 후속 분류 검증에서 P3 스키마를 적용했지만 실결제는 활성화하지 않았습니다. [결제 결정 기록](docs/operations/commerce-decisions.md)을 참고하세요.

P4는 수강권과 시간창을 확인한 수업 입장, 담당 강사 출결·수정 이력, 과제·재제출·피드백 버전, 현재 보호자 조회, 검증된 수강 후기·신고 처리, 같은 과정 다음 기수 개설·새 가격 재수강, 범위별 지표를 제공합니다. Daily Prebuilt를 선택했고 실계정 연결은 대기 중입니다. 실제 파일 저장소·검사기는 아직 연결하지 않았으며 미검사 파일은 다운로드하지 못합니다. 실제 Supabase에 0001~0004 스키마를 적용했고 새 분야·일반인 수업의 서버 개설·공개·검색을 검증했습니다. `LEARNING_ENABLED` 등 기능 활성화 설정은 바꾸지 않았습니다. [실제 DB 검증](docs/operations/supabase-catalog-verification.md), [최종 QA](docs/operations/final-qa.md), [출시 관문](docs/operations/release-checklist.md)을 참고하세요.

P1 데모가 필요하면 로컬 환경변수 `DEMO_MODE=true`로 실행합니다. 이 모드의 저장은 현재 페이지 메모리에만 남고 새로고침하면 초기화됩니다. 데모 모드에서는 실제 변경 API를 사용할 수 없습니다.

현재 데모 학원 3곳·수업 10개·각 수업 4회차는 모두 합성 데이터입니다. 수학·영어에 프로그래밍·AI 활용·AI 자격증·AI Agent 개발을 더했고, 대상에 일반인을 포함했습니다. [분류 확장 기록](docs/operations/catalog-expansion.md)을 참고하세요. P1 데모에서는 실제 인증·DB를 사용하지 않습니다. P3/P4 브라우저 검증도 별도 합성 계정과 로컬 테스트 DB를 사용합니다. 실제 PG·AI 모델·화상회의·파일 업로드 서비스는 연결하지 않았습니다.

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
npm run test:e2e:p3
npm run test:e2e:p4
```

브라우저 테스트는 별도의 3100(P1)·3101(P2)·3102(P3)·3103(P4) 서버와 분리된 빌드·결과 디렉터리를 사용합니다. P2/P3/P4 테스트는 임시 PostgreSQL과 프로덕션에서 금지된 서명 테스트 세션을 사용합니다. 실제 Supabase/Resend/Daily 키를 테스트 서버에 전달하지 않습니다. 네트워크/프로세스 제한이 있는 환경에서는 로컬 서버와 Chromium 실행 권한이 필요합니다.

대표 화면 캡처: 서버 실행 후 `node scripts/qa-screenshots.mjs`.

## 문서

- `DESIGN.md`: 디자인 시스템
- `docs/superpowers/specs/2026-11-08-eduon-mvp-design.md`: 승인된 MVP 설계
- `docs/superpowers/plans/2026-11-08-eduon-mvp-implementation.md`: 단계별 계획
- `docs/operations/p1-qa.md`: P1 검증 결과·수정·한계
- `docs/operations/p2-qa.md`: P2 구현·검증·외부 연결 대기
- `docs/operations/p2-setup.md`: Supabase·DB·메일 설정
- `docs/operations/p3-qa.md`: P3 구현·검증·제공자 미선택 범위
- `docs/operations/commerce-decisions.md`: 테스트 정책·결제 서비스 추천·활성화 경계
- `docs/operations/payment-recovery.md`: 서명 스케줄러·작업 복구·운영자 재처리
- `docs/operations/final-qa.md`: P4 구현·보안·브라우저 검증 결과와 출시 판정
- `docs/operations/provider-contracts.md`: Daily 선택·잔여 위험·저장소 추천과 검증 구분
- `docs/operations/release-checklist.md`: 운영 시작 관문과 미완료 항목
- `docs/operations/incident-runbook.md`: 경보·장애·키 교체·롤백 대응
- `docs/operations/backup-restore.md`: 백업·복구 훈련과 현재 증거
- `docs/operations/privacy-retention.md`: 개인정보·보관 정책 검토 초안
- `docs/operations/performance.md`: 로컬 합성 성능·SQL 계획·스테이징 한계
- `docs/operations/dependencies.md`: 버전·의존성 확인 근거

P1 합성 데이터는 `src/demo`, P2 업무 모듈은 `src/modules`, 서버·통합 어댑터는 `src/server`와 `src/integrations`에 분리되어 있습니다. CI는 타입·린트·단위·빌드·E2E를 실행하도록 구성했으며 원격 CI 실행은 별도입니다.
