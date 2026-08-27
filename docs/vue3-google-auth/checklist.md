# Vue 3 화면 전환 및 구글 로그인 체크리스트

## Phase 1: Google OAuth 백엔드 구현
- [ ] `.env` 및 `server.js`에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` 설정
- [ ] `users.json`에 사용자별 구글 이메일 필드(`email`) 추가 및 화이트리스트 검증 로직 작성
- [ ] 백엔드 OAuth URL 생성 엔드포인트 `/api/auth/google/url` 구현
- [ ] 백엔드 OAuth 콜백 엔드포인트 `/api/auth/google/callback` 구현 및 세션 토큰 발급
- [ ] 세션 검증 엔드포인트 `/api/auth/me` 구현

## Phase 2: Vue 3 + Vite 프론트엔드 기본 구축 (`frontend/`)
- [ ] `frontend/` 디렉터리에 Vite + Vue 3 + TypeScript 프로젝트 생성 및 세팅
- [ ] Tailwind CSS 및 UI 아이콘 패키지 설치
- [ ] Pinia 스토어 (`stores/auth.ts`, `stores/chat.ts`) 구성
- [ ] Vue Router (`router/index.ts`) 및 인증 가드(Navigation Guard) 설정
- [ ] `LoginView.vue` (구글 로그인 버튼 + PMS 스타일 UI) 구현
- [ ] `AuthCallbackView.vue` (토큰 수신 및 대시보드 리디렉션) 구현

## Phase 3: 메인 채팅 및 소스 뷰어 컴포넌트 이식
- [ ] `ChatMessage.vue` 마크다운 렌더링 + 스트리밍 버퍼 렌더러 이식
- [ ] `MainChatView.vue` 질문 입력, 실시간 SSE 스트리밍 수신, 추천 칩 연동
- [ ] `SourceViewerModal.vue` 파일 트리 네비게이터 + CodeMirror 소스 뷰어 + 소스 분석 API 연동
- [ ] `ChatHistoryDrawer.vue` 대화 기록 목록, 삭제(툼스톤 동기화), 새 대화 기능 연동
- [ ] 설정 모달 (모델 선택, persona 모드, 권한 표시) 구현

## Phase 4: 빌드 및 배포 연동
- [ ] `package.json` 빌드 스크립트(`npm run build:frontend`) 추가
- [ ] `server.js`에서 Vue 3 빌드 정적 파일(`frontend/dist`) 서빙 및 SPA fallback 설정
- [ ] 로컬 빌드 및 문법 검증 통과 확인
- [ ] Dockerfile 및 Jenkins 배포 파이프라인 정합성 확인
