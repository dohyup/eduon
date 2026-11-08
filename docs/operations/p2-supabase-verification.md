# P2 실제 Supabase 연결 검증

검증일: 2026-11-09 (Asia/Seoul).

## 확인한 결과

- 인증 API와 PostgreSQL 연결 문자열이 같은 프로젝트를 가리킴을 확인했다.
- 비어 있던 `public` 스키마에 `0001_identity_catalog` 마이그레이션을 적용하고 완료 이력을 조회했다. 기존 데이터 삭제나 reset은 실행하지 않았다.
- 앱 테이블 15개와 Prisma 이력 테이블의 RLS 활성화를 확인했다. 일반 브라우저 역할용 허용 정책은 추가하지 않았다.
- 런타임 Session pooler 연결에서 TLS 암호화와 서버 인증서 검증 성공을 확인했다. 인증서 검증을 비활성화하지 않았다.
- 런타임 연결은 현재 제공된 `BYPASSRLS` 역할을 사용한다. 서버의 사용자·학원·보호자 권한 검사는 계속 필요하며, 최소 권한 전용 역할 분리는 운영 전 과제다.
- 앱을 새 환경변수로 재시작했다. 비로그인 `/api/me` 요청은 `401 UNAUTHENTICATED`, `private, no-store`로 차단됐다.
- 사용자가 Supabase 프로젝트에 로그인 계정을 등록하고 이메일 확인을 완료했다. 계정 생성과 비밀번호 입력은 사용자가 직접 수행했다.
- 앱 브라우저에서 실제 이메일 로그인 요청을 제출했고 Supabase의 해당 사용자 로그인 메일 발송 시각 갱신을 확인했다.

## 실제 로그인·로그아웃 검증 결과

- 사용자가 메일 링크를 로그인 요청을 보낸 앱 브라우저에서 열었고, `/parent`의 실제 계정 화면을 직접 관찰했다.
- Supabase의 로그인 이력과 동일 UUID의 EDUON `User` 생성이 반영된 것을 조회했다. 가짜 테스트 인증이나 토큰 주입을 사용하지 않았다.
- 새로고침 뒤에도 인증된 계정과 보호자 상태가 다시 로드됐다.
- 이메일 로그인만으로 운영자 또는 보호자 확인 권한이 부여되지 않음을 DB와 화면에서 확인했다.
- 화면에서 로그아웃한 뒤 `/login`으로 이동했고, 다시 `/parent`에 접근해도 로그인 화면으로 리다이렉트됐다. 검증 종료 시 브라우저는 로그아웃 상태다.
- 로그아웃 후 해당 계정의 Supabase 세션 수가 0인 것을 조회했다. 읽기 전용 트랜잭션에서 `anon`과 `authenticated` 역할로 사용자 테이블을 조회했을 때 모두 0행이 보임을 확인했다.

토큰 만료 후 자동 갱신, 이미 사용한 링크 재사용, 만료 링크, 계정 복구, 커스텀 SMTP·발신 도메인은 이번 검증 범위에서 완료하지 않았다. 새로고침 후 세션 유지와 만료 후 refresh-token 갱신은 별도 검증 항목이다.

## 로컬 설정 보정

연결 문자열의 비밀번호에 있던 `#`이 따옴표 없는 환경변수에서 주석으로 해석됐다. 비밀번호 자체는 변경하지 않고 URI 인코딩과 따옴표로 형식만 보정했다.

Supabase가 HTTPS로 배포한 공개 CA를 `.tmp/certs/supabase-ca.crt`에 저장했다. 런타임 URL에는 `sslmode=verify-full`과 `sslrootcert` 경로를, 마이그레이션 URL에는 `sslmode=require`, `sslcert`, `sslrootcert`, `sslaccept=strict`를 적용했다. 공개 CA는 Supabase Root 2021 CA이며 SHA-256 지문은 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`다.

`.env.local`과 `.tmp/`는 Git 제외 상태다. 다른 환경에는 해당 환경의 인증서 파일 경로와 비밀 설정을 따로 구성해야 한다. 풀러 클라이언트 연결의 TLS 검증을 전체 인프라 보안 검증으로 간주하지 않는다.

참고: [Supabase 연결 및 TLS](https://supabase.com/docs/guides/database/connecting-to-postgres), [SSL 모드](https://supabase.com/docs/guides/platform/ssl-enforcement), [Prisma 드라이버별 TLS](https://www.prisma.io/postgres/ssl-connection-error).
