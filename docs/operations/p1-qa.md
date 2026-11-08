# EDUON P1 구현·QA 결과

최종 검증일: **2026-11-09, Asia/Seoul**. 브랜치 `codex/eduon-mvp`.
결론: **P1 반응형 프로토타입 기능과 로컬 검증 완료. 운영 MVP는 아님.**

## 구현 범위

- 공개 홈, 과목·학년·수준·예산 검색, 수업 상세, 가상 학원 소개, 입점 안내.
- 가상 학원 2곳, 영어·수학 수업 6개, 모집기수당 주간 4회차·50분.
- 학부모: 자녀 전환·학습 현황·결제 예시·자녀 연결 안내.
- 학생: 내 수업·과제 입력과 로컬 저장 안내.
- 원장: 오늘 수업·수업 관리·수강생·정산 예시·개설 안내.
- 강사: 출결 선택·저장·피드백 입력. 운영자: 입점 승인·보완·거래 예시.
- 로그인/가입/온보딩은 개인정보 입력 없는 역할 체험 안내.
- 정상·빈 결과·오류·로딩·확인 대기, 잘못된 경로 404, 모바일 검색 토글·사이트/업무 메뉴 서랍.

모든 업무 저장은 페이지 메모리에만 유지된다. 새로고침하면 초기화된다. 실제 인증·권한 보안·DB·AI 모델·수강권·결제·화상회의·메일·파일 저장은 연결하지 않았다. 공개 방문자도 역할 화면에 접근할 수 있으며 이는 데모 의도다.

## 실행한 검증과 증거

| 명령/검증 | 최종 결과 |
| --- | --- |
| `npm ci` | lockfile 기반 재설치 성공 |
| `npm run typecheck` | 통과 |
| `npm run lint` | 오류·경고 없음 |
| `npm run test:unit` | 15 passed |
| `npm run build` | Next.js 프로덕션 빌드 성공 |
| `npm start` + `npm run test:e2e` | 실제 프로덕션 서버 대상으로 Chromium 24 passed, 약 18초 |
| `node scripts/qa-screenshots.mjs` | 390/1440px × 대표 6화면, 총 12장; pageerror 0 |
| `npm audit --omit=dev` | 런타임 의존성 취약점 0 |
| `git diff --check` | 공백 오류 없음, Windows LF/CRLF 변환 안내만 있음 |

원격 GitHub Actions는 구성만 했으며 실행하지 않았다. 실제 디바이스/Safari/Firefox 검증은 하지 않았다. Playwright Chromium의 viewport 기반 검증이며 모바일 기기 전체 적합성을 보장하는 결과는 아니다.

## 반응형·접근성

- 360/390/768/1024/1440px에서 홈·검색·상세·학부모·학생·원장·강사·운영자 화면 40개 조합의 가로 넘침을 검사했다.
- 별도로 모바일 홈 제목의 실제 bounding box가 viewport 안에 있는지 검사했다. overflow:hidden으로 잘림을 감추는 문제를 방지한다.
- 공개/업무 모바일 메뉴, 검색 토글, 신청 다이얼로그의 Tab/Shift+Tab 포커스 제한, ESC 닫기·트리거 복귀를 확인했다.
- axe WCAG 2 A/AA·2.1 AA 자동 검사: 홈·검색·학부모 화면에서 위반 0. 전체 수동 접근성 인증을 의미하지 않는다.
- 검색 조건은 URL에 남으며 오류/빈 결과에서도 수정·초기화 경로가 있다.

## 발견하여 수정한 사항

| 문제·근거 | 수정 | 재검증 |
| --- | --- | --- |
| 검색 select의 label 텍스트에 옵션이 포함되어 정확한 라벨 검색 실패 | htmlFor/id의 독립 라벨 | 검색 E2E 통과 |
| native dialog에서 마지막 Tab이 브라우저 영역으로 빠짐 | 공통 포커스 순환 처리 | 연속 Tab·역방향·ESC 회귀 통과 |
| root loading 경계가 404 발생 전 HTTP 200으로 스트리밍 | 불필요한 root loading 제거, 역할별 로딩 체험 유지 | 없는 수업 HTTP 404 확인 |
| 홈 보조 문구 대비 4.43:1 | 더 진한 텍스트 색상 | axe 위반 0 |
| 모바일 hero 내부 grid 최소 폭으로 제목이 390px 화면에서 x=516까지 잘림 | minmax(0,1fr)·min-width:0 | bounding box 회귀 통과·재캡처 확인 |
| 공개/역할별 학원명·금액·회차 예시 불일치 | 공유 catalog 참조·실제 합성 4회차 | 단위·자녀 전환·전체 E2E 통과 |
| 원래 카드 CSS가 태블릿 학원 소개의 세 번째 수업을 숨김 | 항목 숨김 규칙 제거 | 최종 빌드·화면 재확인 |
| 모바일 공개 사이트 탐색 경로 부족 | 사이트 메뉴 서랍 | 모바일 입점 안내 이동 통과 |

## gstack·superpowers 적용

- superpowers executing-plans/TDD/verification-before-completion: 승인된 P1의 세 작업 실행, 실패 테스트 확인 후 구현·수정, 최종 재설치와 빌드·브라우저 검증.
- 테스트와 역할별 화면은 별도 작업자가 담당하고 부모 작업자가 소스·화면·실행 결과를 통합 검토했다.
- gstack browse 실행 재시도: `Cannot find server.ts`로 실패. 도구 자체 설치 수정은 별도 범위이므로 수행하지 않고 계획의 Playwright 대체 경로를 사용했다.
- gstack qa/design-review 기준으로 실제 탐색·기능·상태·모바일·접근성·내용 정확성을 검사했다. review 체크리스트의 데이터·신뢰 경계·상태·예외 항목을 자체 검토했다. P1에는 DB/LLM/외부 서비스 호출이 없어 그 경계는 미구현 상태로 분류했다.
- 정식 gstack 전체 자동 워크플로·리뷰 로그 승인·외부 모델 보안 리뷰를 완료한 것으로 기록하지 않는다.

## 계획 대비 조정·저장소 상태

- 시맨틱 native 입력과 CSS 버튼 변형을 재사용한다. 소비처가 없는 button/field/status 래퍼를 형식적으로 추가하지 않았다.
- root loading.js는 404 응답을 위해 도입하지 않았으며 역할별 로딩 상태 체험은 제공한다.
- 기존 사용자의 커리업 삭제는 복원하지 않았다. 새 앱은 `src/app`에 있다.
- 자동 커밋·푸시·병합은 하지 않았다. 기존 삭제를 제외한 새 앱만 커밋하면 HEAD의 과거 root `app`과 새 `src/app`이 함께 남아 체크아웃이 불일치할 수 있어, 삭제와 새 구조의 통합 커밋은 별도 정리가 필요하다. 현재 작업 트리에서는 정상 실행된다.
- 현재 로컬 프로덕션 미리보기는 127.0.0.1:3000. 외부 공개 배포는 하지 않았다.

## 남은 항목

- 개발 도구 의존성 moderate 8건(ESLint/typescript-eslint→minimatch), high/critical 0. 런타임 감사는 0건. major downgrade/강제 업데이트 대신 개발 도구 업데이트 시 재검토한다. 자세한 근거는 `dependencies.md`.
- P2: 실제 인증·보호자 확인·학원별 권한·DB. P3: PG·정원·환불. P4: 실제 화상·파일·학습 운영·출시 검증.

## 화면 근거

- [홈 데스크톱](screenshots/home-1440.png) / [홈 모바일](screenshots/home-390.png)
- [검색 데스크톱](screenshots/classes-1440.png) / [검색 모바일](screenshots/classes-390.png)
- [상세 데스크톱](screenshots/detail-1440.png) / [상세 모바일](screenshots/detail-390.png)
- [학부모 데스크톱](screenshots/parent-1440.png) / [학부모 모바일](screenshots/parent-390.png)
- [학생 데스크톱](screenshots/learn-1440.png) / [학생 모바일](screenshots/learn-390.png)
- [원장 데스크톱](screenshots/academy-1440.png) / [원장 모바일](screenshots/academy-390.png)

## 다음 작업을 위한 학습

문서 scrollWidth 검사는 overflow:hidden 내부의 시각적 잘림을 찾지 못한다. 대표 제목·주요 행동의 bounding box와 스크린샷을 함께 확인한다. Next의 로딩 경계는 notFound의 HTTP 상태에 영향을 줄 수 있으므로, 화면만 아니라 응답 상태도 테스트한다.
