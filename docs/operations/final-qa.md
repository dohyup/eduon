# EDUON P4 최종 검증 기록

실행일 2026-11-09. 브랜치 `codex/eduon-p4`, 기준 `f29941d`.

**현재 판정: 내부 기능 구현, 실제 시범 운영 NO-GO.** 실제 PG 선택은 보류 상태이며 Daily 키·도메인, 실제 private 저장소·파일 검사기, 승인 정책, 스테이징 성능·복구·경보 증거가 없다. P4 원격 마이그레이션·실결제·카메라 통화·배포는 하지 않았다. 기존 P2 Supabase 인증 검증 기록과 이번 합성 P4 검증을 구분한다.

## 구현 범위

- 학생은 본인 계정·검증된 결제/회차 수강권·현재 학원/담당·입장 시간창을 확인한 뒤 개인 토큰을 받는다. 보호자와 미배정 강사는 학생 입장권을 받지 못한다. 부분 환불로 취소한 회차·전체 환불·해임·관계 해제는 다음 요청에서 재검사한다.
- 출결은 담당 강사가 실제 수업 시작 후 사유와 함께 기록한다. 수정 이력은 append-only이며 접속을 자동 출석으로 바꾸지 않는다. 종료+10분 이후 완료 작업은 서명 스케줄러·영속 queue·claim fence·페이지 continuation으로 실행한다.
- 과제·자료·제출·피드백은 수업/회차/학생 범위로 검사한다. 늦은 제출·완료 후 제출과 재제출 버전, 피드백 수정 이력을 보존한다. 제출 파일은 정확한 과제 컨텍스트로 다운로드 권한을 확인한다.
- 완료 수강권당 후기 1개, 현재 학생/원래 결제 보호자만 작성, 신고는 관리자 사유와 hide/keep 처리한다. 재수강은 같은 Course의 새 공개 Offering과 현재 가격으로 새 주문을 만든다. 원장은 실제 UI/API로 같은 과정 다음 기수를 개설한다.
- 검색 노출·상세·신청·검증된 paid·강사 확인 첫 참여·재수강을 구분한다. 고유 키로 중복 제거하며 과거 참여 이벤트를 출결 정정에 따라 과거에서 삭제하지 않는다. 학원 owner는 소속 집계, 플랫폼 관리자만 전체 집계를 본다. 익명 방문자 전체 전환율을 뜻하지 않는다.
- LLM 설명은 선택적 계약만 구현했다. 공개 사실·허용 이유만 받고 3초/사용량 제한·구조/ID 검증에 실패하면 원래 규칙 결과를 유지한다. 실제 모델 미연결, 생성형 학습 리포트 제외.

## 검증 명령과 결과

최종 전체 실행 결과다. 로컬 테스트 DB·합성 계정·격리 제공자만 사용한다.

| 명령                                                         | 결과                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `npm run test:unit`                                          | 85/85 통과                                           |
| `npm run db:migrate:test`                                    | 0001~0003 새 격리 schema 적용 통과                   |
| `npm run test:e2e`                                           | P1 24/24 통과                                        |
| `npm run test:e2e:p2`                                        | P2 8/8 통과                                          |
| `npm run test:e2e:p3`                                        | 6/6 통과                                             |
| `npm run test:e2e:p4`                                        | 11/11 통과 (전체 최종 실행)                          |
| `npm run test:integration`                                   | 21개 파일 149/149 통과                               |
| `npm run typecheck` / `npm run lint` / `npm run build`       | 타입·린트·빌드 통과                                  |
| `npx tsx --conditions=react-server scripts/benchmark-p4.mts` | 로컬 검색 p95 9.15ms, 명단 p95 8.01ms; 스테이징 아님 |
| `npx tsx --conditions=react-server scripts/test-backup.mts`  | 로컬 pg_dump/pg_restore 도구 미설치, 복구 미실행     |

P4 브라우저는 360/390/768/1024/1440px에서 학생·강사·보호자 등 6개 경로의 overflow, axe serious/critical, 브라우저 pageerror를 검사한다. 전체 여정은 원장 신청→승인→수업 개설→보호자 신청/내부 결제→학생 입장→실제 시간 경과 후 강사 출결/과제/피드백→보호자 확인을 포함한다. 완료 과목 fixture는 내부 출결/수료 서비스로 생성하며 후기·다음 기수 UI·재수강·신고를 검증한다. 카메라가 없는 fake 통화 URL은 실제 통화 증거가 아니다.

## 리뷰와 수정

gstack review/qa/design-review 기준과 superpowers의 테스트 우선 구현·독립 리뷰·수정 후 검증을 적용했다. gstack browse daemon은 이 Windows 환경에서 server.ts를 찾지 못해 실행되지 않았으며 Playwright/axe와 캡처 육안 확인으로 대체했다. gstack 전용 daemon 검증 성공으로 보고하지 않는다.

초기 독립 리뷰의 4건을 수정했다: 첫 페이지와 다음 페이지 정렬 불일치로 과제 중복/누락, 완료 수강의 늦은 제출 UI 누락, TEST_DATABASE_URL/DATABASE_URL 분리 시 fake 저장소 보호 누락, 같은 Course의 다음 기수 생성 경로 누락. 추가로 모집 종료 기수도 강사 일정 충돌을 막고, learning 플래그 off에서 대기 수료 작업을 소모하지 않도록 수정했다. 각 문제는 해당 회귀 테스트에서 재현·수정했다.

후속 독립 리뷰에서 검색 노출 이벤트가 일반 업무 요청의 제한을 소모하는 문제를 발견했다. 측정 요청에 별도 telemetry 버킷을 적용하고 한도 소진 후 유효한 주문이 계속 생성되는 회귀를 추가했다. P3 관리자 회귀는 버튼 문구를 일반화한 변경으로 기존 locator가 실패해 거래/학습별 문구를 구분한 후 재검증했다.

추가 권한 보강: 완료 상태와 paid만으로 후기를 허용하던 경로에 현재 payment.verifiedAt 검사를 추가했다. 완료 후 검증 증거를 제거한 회귀가 RED로 재현됐고, 보강 후 후기 5개·전체 통합 149개와 완료 수강 브라우저 여정을 다시 통과했다.

테스트 도구 경고: pg adapter의 중첩 client.query deprecation, Next dev의 요청 취소 ECONNRESET/NO_COLOR 경고가 일부 기존 회귀에 나타났다. exit code와 assertion 결과는 위 표로 기록하며 경고를 실서비스 오류 없음 증거로 대신하지 않는다.

## 운영 수용 전 남은 사항

[release-checklist.md](release-checklist.md), [provider-contracts.md](provider-contracts.md), [backup-restore.md](backup-restore.md), [performance.md](performance.md)를 따른다. 현재 실제 파일 어댑터/검사기와 스테이징은 미구현/미검증 범위다. 운영용 개인정보 삭제·보관 purge와 외부 경보도 구현 완료로 표시하지 않는다. 관문이 모두 통과한 릴리스 변경 검토 전 `EDUON_DEPLOYMENT=production`은 시작을 차단한다.

대표 합성 캡처: [학생 360px](screenshots/p4-student-360.png), [강사 1440px](screenshots/p4-instructor-1440.png). 전체 30개 폭별 캡처는 로컬 ignored .tmp/p4-ui-screenshots에 있다.
