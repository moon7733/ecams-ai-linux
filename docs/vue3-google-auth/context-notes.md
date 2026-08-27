# Vue 3 화면 전환 및 구글 로그인 결정 기록

## 2026-08-27
- **결정:** eCAMS AI 화면을 PMS(`C:\pms\pms\frontend`)와 동일한 Vue 3 + Vite + TypeScript + Pinia 스택으로 전환하고, 구글 로그인(Google OAuth 2.0)을 연동하기로 확정했다.
- **인증 정책:**
  - Google Cloud Console에 `https://ecams.tail4f6f17.ts.net:10000/api/auth/google/callback` 및 승인된 자바스크립트 원본(`https://ecams.tail4f6f17.ts.net:10000`)을 등록 완료했다.
  - Client ID 및 Secret은 `.env` 환경변수(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)로 주입 관리한다.
  - `users.json`에 이메일 필드를 추가하여, 사전에 승인된 이메일 계정만 로그인 가능한 화이트리스트 정책을 유지한다. 미승인 계정은 403 차단.
- **점진적 전환 전략:**
  - 백엔드는 기존 Node.js (`server.js`) 비동기/PTY 아키텍처를 유지하고 Google OAuth API 라우트만 확장한다.
  - 프론트엔드는 `frontend/`에 독립된 Vue 3 SPA로 구축하여 빌드 결과물(`frontend/dist`)을 Express 정적 서빙으로 통합한다.
