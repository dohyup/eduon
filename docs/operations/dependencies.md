# P1 의존성 기록

2026-11-08~09 확인, Windows/Node.js 24.18.0에서 로컬 검증.

- Next.js 16.4.5 / React·React DOM 19.3.1
- Tailwind CSS 및 PostCSS 어댑터 4.3.5
- Vitest 5.1.0 / Playwright 1.65.0
- TypeScript·ESLint·axe·Lucide·Prettier의 정확한 설치 버전은 package.json과 package-lock.json에 고정.
- 공식 레지스트리의 engines/peerDependencies와 로컬 Node 호환성을 확인. RC/canary 미사용.
- [Next.js 설치 문서](https://nextjs.org/docs/app/getting-started/installation)와 [Tailwind Next.js 안내](https://tailwindcss.com/docs/installation/framework-guides/nextjs) 확인 후 App Router·Tailwind v4 PostCSS 방식 적용.
- 외부 폰트를 빌드 때 다운로드하지 않도록 한국어 시스템 폰트 사용. Pretendard는 필수 의존성이 아님.

## 감사 결과와 적용 범위

최초 npm audit에서 moderate 8건, high/critical 0건. 모두 ESLint/typescript-eslint 경로의 개발 의존성 minimatch 관련 전파 결과다. 자동 해결 제안이 eslint-config-next 메이저 다운그레이드를 포함하므로 force fix를 수행하지 않았다. 기존 개발 도구는 정상 lint/typecheck 결과와 함께 유지한다. 배포 전 개발 도구 업데이트 시 다시 감사한다.

`npm audit --omit=dev` 결과는 P1 QA 보고서에 기록한다. 라이브러리 이름과 버전만으로 보안·호환성을 보장하지 않고 실제 설치·빌드·브라우저 결과를 근거로 판단한다.
