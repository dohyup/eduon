# Zoom App Marketplace 연동 설정 가이드

본 문서는 에듀온(EduOn) LMS 플랫폼에 통합된 **Zoom 실시간 화상강의·출석 자동화·클라우드 녹화 다시보기 시스템**을 운영 환경 및 개발 환경에서 설정하고 검증하는 절차를 안내합니다.

---

## 1. Zoom App Marketplace 접속

1. 웹 브라우저에서 [Zoom App Marketplace](https://marketplace.zoom.us/)에 접속합니다.
2. 플랫폼 운영자(개발자) Zoom 계정으로 로그인합니다.
3. 우측 상단 **Develop** 메뉴에서 **Build App**을 선택합니다.

---

## 2. General App 생성

2024~2026년 Zoom Marketplace 통합 앱 체계에 따라 **General App** 유형으로 앱을 생성합니다 (단일 앱에서 OAuth 2.0, Meeting SDK, Webhook을 모두 포함할 수 있습니다).

1. **What kind of app are you creating?** 화면에서 **General App**을 선택하고 **Create**를 클릭합니다.
2. 앱 이름을 지정합니다 (예: `EduOn Live Classroom`).

---

## 3. User-managed OAuth 설정

본 플랫폼은 여러 입점 강사가 각자의 개인/유료 Zoom 계정을 직접 연결하는 구조이므로 반드시 **User-managed** 방식을 선택합니다.

1. 좌측 메뉴 **Basic Information** → **Choose how your app is managed** 항목에서 **User-managed**를 선택합니다.
2. **App Credentials** 영역에서 발급된 **Client ID**와 **Client Secret**을 확인하여 서버 환경변수(`ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`)에 설정합니다.

---

## 4. OAuth Redirect URL 및 Allow List 등록

1. **OAuth Information** 섹션의 **OAuth Redirect URL**에 아래 콜백 주소를 입력합니다.
   - 로컬 개발 환경: `http://localhost:3000/api/zoom/oauth/callback`
   - 운영 환경: `https://<운영도메인>/api/zoom/oauth/callback`
2. **OAuth Allow Lists**에 동일한 Redirect URL을 추가하고 저장합니다.
3. **Strict Mode for Redirect URLs** 및 **Subdomain Check** 옵션을 활성화하여 미등록 리다이렉트 경로를 차단합니다.

---

## 5. OAuth Scopes 등록 (최소 권한 원칙)

좌측 메뉴 **Scopes**에서 **+ Add Scopes**를 클릭하고 아래 필수 최소 권한만 등록합니다.

| 카테고리 | Scope 이름 | 용도 |
| :--- | :--- | :--- |
| **User** | `user:read:user` | 연결 강사의 Zoom 사용자 ID, 이메일, 계정 유형(Basic/Licensed) 확인 |
| **User** | `user:read:token` | 강사가 호스트로 회의를 시작하기 위한 ZAK(Zoom Access Key) 발급 |
| **Meeting** | `meeting:write:meeting` | 강의 개설·일정 수정·강의 취소 시 Zoom 회의 생성/수정/삭제 |
| **Meeting** | `meeting:read:meeting` | 생성된 Zoom 회의 상태 및 메타데이터 조회 |
| **Recording** | `cloud_recording:read:list_recording_files` | 수업 종료 후 클라우드 녹화 파일 목록 및 재생 메타데이터 동기화 |

---

## 6. Webhook URL 및 Secret Token 설정

1. 좌측 메뉴 **Surface** → **Event Subscriptions**를 활성화합니다.
2. **Add Event Subscription**을 클릭하고 구독 이름을 입력합니다 (예: `EduOn Attendance & Recording Webhook`).
3. **Event notification endpoint URL**에 아래 주소를 입력합니다.
   - 운영 환경: `https://<운영도메인>/api/zoom/webhook`
   - 로컬 개발 테스트(터널 사용 시): `https://<터널도메인>/api/zoom/webhook`
4. 상단에 표시된 **Secret Token**을 복사하여 서버 환경변수 `ZOOM_WEBHOOK_SECRET`에 설정합니다.
5. **Add Events**를 클릭하여 아래 5개 이벤트를 선택합니다:
   - **Meeting**
     - `Start Meeting` (`meeting.started`)
     - `End Meeting` (`meeting.ended`)
     - `Participant/Host joined meeting` (`meeting.participant_joined`)
     - `Participant/Host left meeting` (`meeting.participant_left`)
   - **Recording**
     - `All Recordings have completed` (`recording.completed`)
6. **Validate** 버튼을 클릭하면 에듀온 서버의 `/api/zoom/webhook`이 `endpoint.url_validation` HMAC-SHA256 챌린지에 자동 응답하여 검증이 완료됩니다.

---

## 7. Meeting SDK 활성화

1. 좌측 메뉴 **Surface** → **Select where to use your app**에서 **Meeting SDK**(Web)를 체크합니다.
2. **Embed** 섹션에서 Meeting SDK 자격증명(`SDK Key` / `SDK Secret` 또는 General App의 `Client ID` / `Client Secret`)을 확인하고 서버 환경변수 `ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET`에 등록합니다.

---

## 8. 외부 계정 회의 참가를 위한 Zoom 앱 심사 요건 (2026 정책 필수 확인)

- **중요**: 강사 각자의 외부 Zoom 계정으로 개설된 회의에 수강생이 웹 브라우저 내장 **Zoom Meeting SDK(Component View)** 로 참여하려면 Zoom Marketplace의 **외부 계정 회의 참가 심사(Marketplace App Review)** 가 승인되어야 합니다.
- 심사가 완료되기 전에는 SDK Signature만으로 외부 호스트 회의에 입장할 수 없습니다.
- 에듀온 LMS는 이를 안전하게 처리하기 위해 `ZOOM_EXTERNAL_SDK_APPROVED` 환경변수를 제공합니다:
  - 심사 승인 전(`ZOOM_EXTERNAL_SDK_APPROVED=false`, 기본값): 수강생에게 학생 식별키(`customer_key`)가 포함된 **Zoom 공식 앱/웹 브라우저 안전 입장 경로**를 기본 제공합니다.
  - 심사 승인 후(`ZOOM_EXTERNAL_SDK_APPROVED=true`): LMS 강의실 내장 **Component View 화상 영역**과 외부 앱 대체 경로를 함께 활성화합니다.

---

## 9. 개발 환경과 운영 환경 변수 설정

`.env` 파일 또는 배포 환경의 Secret Manager에 아래 변수를 설정합니다 (`.env.example` 참고).

```dotenv
# Zoom User-managed OAuth 2.0
ZOOM_CLIENT_ID="발급받은_CLIENT_ID"
ZOOM_CLIENT_SECRET="발급받은_CLIENT_SECRET"
ZOOM_REDIRECT_URI="https://eduon.example.com/api/zoom/oauth/callback"

# Zoom Meeting SDK
ZOOM_SDK_KEY="발급받은_SDK_KEY"
ZOOM_SDK_SECRET="발급받은_SDK_SECRET"
ZOOM_EXTERNAL_SDK_APPROVED="false"

# Zoom Webhook Secret Token
ZOOM_WEBHOOK_SECRET="발급받은_WEBHOOK_SECRET_TOKEN"

# 토큰 및 녹화 URL 암호화 키 (운영 환경 필수: 32바이트 이상 또는 64자리 hex)
ZOOM_TOKEN_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
```

설정 후 `npm run config:check`를 실행하여 필수 환경변수 구성을 점검할 수 있습니다.

---

## 10. 실제 Zoom 계정 연결 테스트 방법

1. 강사 또는 학원 운영자 계정으로 LMS에 로그인합니다.
2. **강사 워크스페이스** 상단의 **Zoom 계정 연결하기** 버튼을 클릭합니다.
3. Zoom OAuth 동의 화면에서 권한을 승인하면 `/api/zoom/oauth/callback`을 거쳐 강사 계정과 Zoom 계정이 연결됩니다.
4. **Zoom 실시간 강의 등록** 폼에서 수업 방식(Zoom 실시간 화상강의), 대기실 사용 여부, 자동 녹화 옵션, 회차 일정을 입력하고 개설합니다.
5. 회차별로 생성된 Zoom 회의 상태(`scheduled`)를 확인하고 **호스트로 수업 시작** 버튼으로 입장을 테스트합니다.
6. 수강생 계정으로 로그인하여 수업 시작 10분 전부터 입장 버튼이 활성화되는지, 수업 참여 후 출석률과 공개 승인된 다시보기가 정상 표시되는지 확인합니다.

