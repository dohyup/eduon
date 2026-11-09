# P4 제공자 결정과 검증 범위

2026-11-09 사용자 선택: **Daily Prebuilt**. 빠르게 기본 통화 UI를 사용할 수 있는 경로로 채택했다. 실계정 API 호출·실제 영상 통화·비용 검증은 아직 하지 않았다.

## Daily

서버 전용 `VIDEO_PROVIDER=daily`, `DAILY_API_KEY`, `DAILY_DOMAIN=tenant.daily.co`가 필요하다. 도메인은 정확한 HTTPS 호스트 허용 목록이며 URL/포트/경로 입력을 받지 않는다. 비밀은 `.env.local` 또는 배포 비밀 저장소에서 설정한다.

실제 수강권·학생 계정 또는 담당 강사·현재 학원 승인·입장 시간창(시작 10분 전~종료 10분 후)을 검사한다. 외부 발급 후에도 권한을 재검사한다. 개인용 입장 토큰은 최대 2분, 회의실은 종료+10분에 만료·퇴장한다. 토큰 만료는 이미 참여한 학생을 2분마다 퇴장시키지 않는다. 녹화·자동 전사·전사 저장은 비활성, 강사만 owner, 학생 admin 권한은 없다. 실명·이메일·과제는 전송하지 않고 UUID를 사용한다.

입장 링크는 bearer credential이다. UUID user_id가 링크 전달이나 신원 도용을 물리적으로 막지는 않는다. 이미 발급한 링크와 참여자 즉시 퇴장은 별도 제공자 운영 기능 검증이 필요하다. 토큰은 로그·공개 HTML·DB 목록에 저장하지 않으며, UI는 사용자가 누른 입장 버튼에서만 새 탭을 연다. 회의실 재사용 중 보안 설정 불일치는 거부한다.

실계정 확인 순서: 계정/도메인 읽기 확인 → 합성 비공개 방 → 학생/강사 권한·녹화 비활성·시간 경계 → 잘못된 키/timeout/이미 존재하는 방 → 종료 후 접근 차단 → 테스트 방 정리·사용량 기록. 카메라/마이크 권한은 사용자가 브라우저에서 직접 결정한다. 요청/응답 전문과 토큰은 증거 파일에 남기지 않는다.

계약 구현 기준은 Daily 공식 [회의실 생성](https://docs.daily.co/reference/rest-api/rooms/create-room)과 [토큰 생성](https://docs.daily.co/reference/rest-api/meeting-tokens/create-meeting-token) 문서를 확인했다. 로컬 단위 테스트는 HTTP 계약 모의 응답이며 제공자 승인 증거가 아니다.

## 파일

추천은 기존 인증 프로젝트와 함께 관리할 **Supabase Storage private bucket**이다. [공식 문서](https://supabase.com/docs/guides/storage/buckets/fundamentals)의 private bucket·접근 제어·서명 다운로드 방식에 기반한다. 아직 선택·버킷 생성·실제 어댑터·검사기 연동은 완료하지 않았다.

현재 StoragePort는 격리 fake 환경에서만 구현되어 있다. PDF/PNG/JPEG, MIME+확장자+시그니처, 10MiB/파일·5개/제출을 검사한다. 서버 생성 quarantine key를 사용하며 검사기 미설정/실패는 clean으로 바꾸지 않는다. 다운로드는 clean 파일에 한해 현재 수업·학생·연결 관계와 제출의 정확한 과제를 확인한 뒤 60초 서명을 발급한다. 서명 후에도 관계가 해제될 수 있으므로 짧은 만료를 잔여 위험으로 기록한다. 원본 객체 key와 서명 URL은 목록에 노출하지 않는다.

실제 공급자 작업에는 private bucket/RLS/서버 권한 범위, 업로드 실패 정리, 검사기 timeout·악성 샘플, 60초 만료, 삭제·보관 정책, 교차 학원 권한을 검증해야 한다. RLS가 있는 DB 테이블과 Storage 객체 정책은 별도다.

## 결제·AI

P3 결정대로 PG 선택을 보류했다. 내부 fake 결제·저장소·화상은 loopback `/eduon_test` DB와 명시 테스트 인증에서만 가능하며 실제 Supabase 키 또는 production 모드와 혼용하지 못한다.

선택적 LLM은 연결하지 않았다. publicFacts만 받아 허용한 이유 문구만 사용하며 학생 이름·과제·리포트를 전송하지 않는다. 3초 timeout·분당20회 제한·허구 ID/가격 차단 후 규칙 기반 원본을 유지한다. LLM 미설정은 출시 차단 사유가 아니다.
