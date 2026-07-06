# Chat History User Sync 체크리스트

## 문서

- [x] 계획 문서 작성.
- [x] 체크리스트 작성.
- [x] context notes 작성.

## 서버

- [x] 유저별 대화기록 파일 경로와 read/write 헬퍼 추가.
- [x] `GET /api/chat/history` 추가.
- [x] `PUT /api/chat/history/:id` 추가.
- [x] `DELETE /api/chat/history/:id` 추가.

## 프론트

- [x] 초기화 시 서버 기록과 로컬 기록 병합.
- [x] `saveChat` 서버 동기화 추가.
- [x] `deleteChat` 서버 동기화 추가.
- [x] 저장 실패 시 로컬 캐시 유지.
- [x] 질문+답변 turn 쌍 삭제 UI 추가.
- [x] turn 삭제 후 서버 저장 동기화.
- [x] 빈 대화 처리.

## 검증

- [x] `node --check server.js`.
- [x] 인라인 스크립트 문법 검사.
- [x] 변경사항 커밋.
