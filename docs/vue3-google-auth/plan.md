# Vue 3 화면 전환 및 구글 로그인(Google OAuth 2.0) 연동 계획서

## 1. 개요 및 목적
- **목적:** 바닐라 JS(`public/index.html`)로 단일 파일에 밀집되어 있던 eCAMS AI 프론트엔드를 PMS(`C:\pms\pms\frontend`)와 동일한 현대적 **Vue 3 + Vite + TypeScript + Pinia** 아키텍처로 전면 개편하고, 기존 ID/PW 로그인 방식에서 **Google OAuth 2.0 소셜 로그인**으로 전환한다.
- **주요 가치:**
  - UI 컴포넌트 모듈화로 유지보수성 및 반응형 UX 대폭 향상
  - PMS와 일관된 디자인 시스템 및 인증 체계 확보
  - 보안 강화 (Google OAuth 기반 화이트리스트 인증)

---

## 2. 아키텍처 및 연동 흐름

### A. 구글 OAuth 인증 흐름
1. 사용자가 Vue 3 로그인 화면에서 **[Google로 로그인]** 클릭
2. 백엔드 `/api/auth/google/url`로부터 구글 OAuth 동의 화면 URL을 받아 리디렉션
   - `redirect_uri`: `https://ecams.tail4f6f17.ts.net:10000/api/auth/google/callback`
3. 사용자가 구글 로그인 승인 후 eCAMS 백엔드 콜백 엔드포인트로 `code` 전달
4. 백엔드(`server.js`)는 `code`를 구글 토큰 서버와 교환하여 사용자 이메일(`email`) 및 프로필 획득
5. `users.json`에 등록된 이메일과 매칭:
   - 등록된 사용자: 세션 토큰(`sessions[token]`) 발급 후 Vue 3 프론트엔드로 리디렉션 (`/auth/callback?token=...`)
   - 미등록 사용자: 403 Forbidden ("승인되지 않은 구글 계정입니다. 관리자에게 문의하세요.")
6. 프론트엔드는 토큰을 `localStorage` 및 Pinia `authStore`에 보관하고 메인 화면으로 진입

### B. 프론트엔드 (Vue 3 + Vite) 구조
```text
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── src/
    ├── main.ts
    ├── App.vue
    ├── router/
    │   └── index.ts (인증 가드 포함)
    ├── stores/
    │   ├── auth.ts (로그인 상태, 권한, 유저 정보)
    │   └── chat.ts (대화 목록, 현재 대화, 스트리밍 상태)
    ├── api/
    │   ├── auth.ts (구글 로그인, 세션 검증)
    │   ├── chat.ts (대화 SSE 스트리밍, 히스토리)
    │   └── source.ts (파일 트리, 소스 분석)
    ├── views/
    │   ├── LoginView.vue (구글 로그인 화면)
    │   ├── AuthCallbackView.vue (OAuth 콜백 수신 및 토큰 처리)
    │   └── MainChatView.vue (메인 채팅 + 소스 뷰어 + 설정)
    └── components/
        ├── ChatMessage.vue (마크다운 스트리밍 렌더러)
        ├── SourceViewerModal.vue (CodeMirror 소스 뷰어 및 분석)
        ├── ChatHistoryDrawer.vue (대화 히스토리 관리)
        └── SuggestionChips.vue (추천 질문 및 고객사 칩)
```

---

## 3. 세부 작업 단계

1. **[Backend] Google OAuth 백엔드 API 구현 (`server.js`, `users.json`)**
   - Google Client ID / Secret 환경변수 연동
   - OAuth 인증 URL 생성 및 콜백 처리 (`/api/auth/google/url`, `/api/auth/google/callback`)
   - 이메일 기반 화이트리스트 인증 및 세션 토큰 발급
2. **[Frontend] Vue 3 + Vite 기반 프로젝트 세팅 (`frontend/`)**
   - PMS 구조를 벤치마킹하여 Vite + Pinia + Tailwind + Vue Router 세팅
   - `LoginView.vue` 및 `AuthCallbackView.vue` 구현 (구글 로그인 완성)
3. **[Frontend] 메인 기능 Vue 3 컴포넌트 이식**
   - 실시간 SSE 스트리밍 채팅 UI (`MainChatView.vue`, `ChatMessage.vue`)
   - 소스 뷰어 모달 (`SourceViewerModal.vue` + CodeMirror 6)
   - 히스토리 사이드바 및 권한 제어
4. **[Build & Deploy] 빌드 및 배포 파이프라인 연동**
   - Vite 빌드 산출물(`frontend/dist`)을 `server.js`의 정적 파일 서빙 또는 Nginx와 연동
   - Dockerfile 및 docker-compose 반영
