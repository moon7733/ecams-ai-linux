# 유료 API dead path 제거 체크리스트

- [x] 기존 합의와 현재 변경 상태 확인.
- [x] `server.js` 유료 dispatch와 model label 제거.
- [x] `runDeepSeekStream` 제거.
- [x] Gemini 답변 경로 제거.
- [x] `/api/chat` 기본값과 fallback 방어.
- [x] `.env`에서 `DEEPSEEK_API_KEY` 제거.
- [x] `node --check server.js` 검증.
- [x] `npm run build:cm` 검증.
- [x] 결과 기록과 커밋.
