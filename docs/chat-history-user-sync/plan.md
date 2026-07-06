# Chat History User Sync 계획

## 목적

브라우저별 `localStorage`에만 남던 대화기록을 로그인 아이디 기준으로 통합한다.

## 범위

- 서버에 유저별 대화기록 JSON 저장소를 둔다.
- 로그인 후 서버 기록과 기존 브라우저 기록을 병합한다.
- 새 대화 저장과 대화 삭제를 서버에 동기화한다.
- 감사 로그(`answer_log`)는 보존하고, 화면 대화기록 삭제와 분리한다.

## 접근

1. `logs/chat_history/<userId>.json` 파일에 최근 50개 대화를 저장한다.
2. `GET /api/chat/history`, `PUT /api/chat/history/:id`, `DELETE /api/chat/history/:id` API를 추가한다.
3. 프론트는 앱 초기화 시 서버 기록과 `localStorage` 기록을 병합한다.
4. `saveChat`과 `deleteChat`은 기존 로컬 저장 후 서버 동기화를 best-effort로 호출한다.

## 검증

- `node --check server.js`.
- 인라인 `<script>` 문법 검사.
- 가능하면 서버 API 스모크 테스트.
