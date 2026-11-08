# P2 Supabase 연결 안내

2026-11-09 사용자가 **Supabase Auth + PostgreSQL**을 선택했고, 기존 프로젝트의 연결 정보를 `.env.local`에 직접 설정하기로 했다. 프로젝트 생성·유료 계약·원격 마이그레이션은 자동 실행하지 않았다.

## 1. 로컬 환경변수

프로젝트 루트 `.env.local`에 `.env.example`의 항목을 채운다. 이 파일은 Git에서 제외된다. 비밀번호·API 비밀키를 채팅이나 Git에 붙여넣지 않는다.

| 항목 | 설정 |
| --- | --- |
| DEMO_MODE | `false` (P2), `true`는 실제 인증을 끄는 P1 데모 |
| APP_ORIGIN | 로컬 `http://127.0.0.1:3000`; 운영은 정확한 HTTPS origin |
| AUTH_PROVIDER | `supabase` |
| SUPABASE_URL | 기존 프로젝트의 API URL |
| SUPABASE_PUBLISHABLE_KEY | publishable key. service_role/secret key를 넣지 않는다 |
| DATABASE_URL | Prisma 런타임 PostgreSQL 연결 문자열. 세션 풀러 또는 직접 연결, TLS 요구 설정 확인 |
| MIGRATION_DATABASE_URL | 마이그레이션 전용 직접/세션 연결. 미설정이면 DATABASE_URL 사용 |
| AUTH_ALLOW_SIGNUP | 초기 `false`, 기존 계정 로그인만 허용 |
| PRIVACY_POLICY_VERSION | 연령·동의·개인정보 정책 검토 후 지정 |
| RESEND_API_KEY, MAIL_FROM | 선택 사항. Resend 발신 도메인 검증 후 설정. 미설정은 수동 초대 링크 전달 |

값이 채워졌는지만 확인한다. 이 명령은 값 자체를 출력하지 않는다.

연결 문자열은 따옴표로 감싼다. DB 비밀번호에 `#`, `@` 같은 문자가 있으면 비밀번호 부분을 URI 인코딩한다. 특히 따옴표 없는 `#`은 환경파일에서 주석으로 처리되어 연결 문자열이 잘린다.

```sh
npm run config:check
```

실사용자 정보 수집 전 가입 연령·보호자 확인·동의·보관·삭제 정책을 확정한다. 이메일 소유 확인은 보호자 관계 확인이 아니다. `AUTH_ALLOW_SIGNUP=true`와 정책 버전이 함께 있어야 SDK의 신규 계정 생성을 허용한다. 플래그가 법적 적합성을 인증하는 것은 아니다.

## 2. Supabase Auth

- 이메일 인증을 활성화하고 프로젝트 Site URL을 APP_ORIGIN과 맞춘다.
- Redirect URL 허용 목록에 `/api/auth/callback`의 완전한 URL을 등록한다. 로컬의 localhost와 127.0.0.1은 다른 origin이다.
- 보안 링크는 PKCE 흐름이며 요청한 브라우저에서 열어야 한다. 리다이렉트는 고정 `/onboarding`이고 외부 `next` URL을 받아 이동하지 않는다.
- 기존 Supabase 계정으로 로그인하거나, 초기 계정은 대시보드에서 초대/생성한다. 정책 확정 전 일반 공개 가입은 열지 않는다.
- 운영 메일은 Supabase의 기본 발송 제한을 확인하고 커스텀 SMTP를 연결한다. **Resend SMTP**를 추천하며 앱 초대 메일 API에도 같은 검증된 발신 도메인을 사용할 수 있다.
- 실제 수신함의 로그인 링크·만료·재사용·로그아웃·세션 갱신은 프로젝트 연결 후 별도 검증한다. 로컬 서명 테스트 세션은 이 검증의 대체가 아니다.

공식 근거: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [커스텀 SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend 메일 API](https://resend.com/docs/api-reference/emails/send-email).

## 3. 초기 마이그레이션

기존 프로젝트의 스키마와 백업을 확인한다. 초기 마이그레이션은 앱 테이블을 생성한다. 기존 동명 테이블이 있으면 강제 reset 없이 충돌을 검토한다.

```sh
npm run db:generate
npm run db:migrate
```

Prisma 명령은 `.env.local`을 자동 읽는 Next 서버와 다르므로 config가 해당 파일을 로드하도록 구성되어 있다. 운영 URL에 테스트 명령을 사용하지 않는다. 테스트 러너는 별도 `eduon_test` DB와 무작위 스키마를 사용한다.

실제 연결에서는 Supabase CA를 구성해 인증서를 검증한다. 런타임 `pg`는 `sslmode=verify-full&sslrootcert=인증서경로`, Prisma 마이그레이션은 별도 `MIGRATION_DATABASE_URL`의 `sslmode=require&sslcert=인증서경로&sslrootcert=인증서경로&sslaccept=strict`를 사용한다. 경로는 URL 쿼리 값으로 인코딩하고, 다른 머신에는 그 머신의 경로를 사용한다. `rejectUnauthorized: false`나 `sslaccept=accept_invalid_certs`로 우회하지 않는다. 현재 프로젝트의 적용 결과는 [실제 Supabase 검증 기록](p2-supabase-verification.md)에 남겼다.

## 4. 서버 전용 DB 권한과 RLS

모든 앱 테이블에 RLS를 활성화하고 브라우저 `anon`/`authenticated` 접근 정책은 만들지 않았다. Supabase Data API에서 직접 조회/수정하지 않고 EDUON 서버가 권한을 검사한다.

마이그레이션 소유자 연결과 런타임 연결은 분리하는 것을 권장한다. 운영 런타임 역할은 전용 LOGIN 역할로 만들고 앱 테이블의 필요한 SELECT/INSERT/UPDATE 및 초대 교체용 DELETE만 허용한다. DDL·다른 스키마 접근·감사 기록 UPDATE/DELETE는 부여하지 않는다. RLS의 전용 서버 역할 정책은 서버 연결에만 적용하고 `anon`/`authenticated`에 같은 정책을 부여하지 않는다. 프로젝트별 역할/풀러 지원은 실제 연결에서 확인한다.

사용자의 기존 프로젝트 역할을 임의 변경하지 않았다. RLS가 켜져 있어도 테이블 소유자·BYPASSRLS 연결은 우회할 수 있으므로, 서버의 학원 소속·자녀 관계 검사를 계속 적용한다.

## 5. 최초 운영자와 보호자 확인

먼저 인증된 계정으로 `/parent`에 접속해 EDUON User가 생성되게 한다. 초기 운영자를 지정하는 로컬 CLI는 운영자가 명시적으로 실행한다.

```sh
npm run admin:bootstrap -- your-operator-email@example.com
```

브라우저 가입이나 user_metadata로 운영자 권한을 부여하지 않는다. 운영자 `/admin`에서 실제 확인을 마친 보호자의 계정 ID와 확인 사유를 기록하면 자녀 등록이 가능해진다. 관계 증빙·연령 확인 절차는 서비스 정책에 맞춰 운영해야 한다. 이메일 인증만으로 자동 승인하지 않는다.

## 6. 테스트와 미리보기

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run db:migrate:test
npm run test:e2e:p2
npm run build
npm start
```

- 로컬 통합 테스트는 실제 PostgreSQL 17 바이너리를 실행한다. Docker 사용 시 `compose.test.yml`의 DB를 `TEST_DATABASE_URL`로 지정할 수 있다.
- E2E는 3101 포트와 별도 `.next-p2`를 사용한다. 테스트 DB·서명 키는 매 실행 새로 생성한다. 외부 Supabase/Resend 키는 테스트 프로세스에서 비워 실제 메일 발송을 차단한다.
- 테스트 인증은 프로덕션에서 활성화할 수 없다. 실제 로그인 성공의 근거로 보고하지 않는다.
- 설정이 없으면 로그인 화면은 입력창을 숨기고 연결 필요 상태를 안내한다. 실제 데이터 모드에서 가상 수업을 실제 모집 수업으로 섞지 않는다.
