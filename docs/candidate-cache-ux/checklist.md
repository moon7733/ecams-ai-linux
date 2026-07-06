# Candidate Cache UX 체크리스트

## 서버 (server.js)
- [ ] 임계값 상수 추가 (`SEMANTIC_AUTO`, `SEMANTIC_CANDIDATE_MIN`, `SEMANTIC_CANDIDATE_MAX`)
- [ ] `/api/chat` 에 `forceFresh` 플래그 수신
- [ ] `/api/chat` exact match 뒤에 시맨틱 검색 블록 추가 (자동반환 0.95 + 후보 ≥0.80)
- [ ] `runChatJob` 의 기존 시맨틱 검색 블록 제거
- [ ] `POST /api/chat/select-cache` 엔드포인트 추가 (id로 캐시 반환 + 권한 검증)

## 프론트 (public/index.html)
- [ ] `sendMessage` 가 `forceFresh` 인자 받도록
- [ ] 응답 처리에 `type: 'candidates'` 분기 + 후보 UI 렌더
- [ ] 후보 클릭 → `select-cache` 호출 → 답변 렌더
- [ ] "모두 새 질문" 버튼 → `forceFresh` 재요청

## 검증
- [ ] `node --check server.js`
- [ ] 서버 부팅 확인
- [ ] 커밋
