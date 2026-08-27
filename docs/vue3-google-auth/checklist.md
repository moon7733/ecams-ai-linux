# Vue 3 화면 전환 및 구글 로그인 체크리스트

## Phase 1: Google OAuth 백엔드 구현
- [x] `.env` 및 `server.js`에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` 설정
- [x] `users.json`에 사용자별 구글 이메일 필드(`email`) 추가 및 @azsoft.kr 도메인 검증 로직 작성
- [x] 백엔드 OAuth URL 생성 엔드포인트 `/api/auth/google/url` 구현
- [x] 백엔드 OAuth 콜백 엔드포인트 `/api/auth/google/callback` 구현 및 세션 토큰 발급
- [x] 세션 검증 엔드포인트 `/api/auth/me` 구현

## Phase 2: Vue 3 + Vite 프론트엔드 기본 구축 (`frontend/`)
- [x] `frontend/` 디렉터리에 Vite + Vue 3 + TypeScript 프로젝트 설정 및 의존성 설치
- [x] Pinia 스토어 (`stores/auth.ts`, `stores/chat.ts`) 구성
- [x] Vue Router (`router/index.ts`) 및 인증 가드(Navigation Guard) 설정
- [x] `LoginView.vue` (구글 로그인 버튼 + @azsoft.kr 안내 UI) 구현
- [x] `AuthCallbackView.vue` (토큰 수신 및 대시보드 리디렉션) 구현

## Phase 3: 메인 채팅 및 소스 뷰어 컴포넌트 이식
- [x] `ChatMessage.vue` 마크다운 렌더링 + 소스 인용 칩 + 추천 질문 칩 이식
- [x] `MainChatView.vue` 질문 입력, 실시간 분석 수신, 고객사 선택 및 대화 히스토리 연동
- [x] `SourceViewerModal.vue` 소스 코드 뷰어 + 소스 분석(/api/fs/analyze) 연동

## Phase 4: 빌드 및 배포 연동
- [x] `server.js`에서 Vue 3 빌드 정적 파일(`frontend/dist`) 서빙 및 `/legacy` 백업 라우트 지원
- [x] `frontend/` TypeScript 컴파일 및 Vite 프로덕션 빌드 통과 확인 (2.35s)
- [x] Dockerfile에 프론트엔드 자동 빌드 파이프라인 추가
