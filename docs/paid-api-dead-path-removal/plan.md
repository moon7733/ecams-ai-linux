# 유료 API dead path 제거 계획

## 목적

일반 AI 질문 hot path를 AGY로 고정하고, 무료 Gemini 되묻기와 임베딩 보조를 제외한 유료 API key 기반 답변 경로를 제거한다.

## 범위

- `server.js`의 OpenRouter 기반 `deepseek`, `deepseek-v3`, `gpt5-mini`, `o3-mini` 답변 분기를 제거한다.
- `runDeepSeekStream` 함수 본체를 제거한다.
- Gemini 답변 경로인 `runGeminiStream`, `runGeminiOnce`, `model === 'gemini'` 분기를 제거한다.
- `/api/chat`의 기본 모델과 catch-all fallback이 Claude CLI로 새지 않도록 방어한다.
- `.env`에서 `DEEPSEEK_API_KEY`만 제거한다.

## 제외 범위

- 무료 Gemini 키, `clarifier.js`, `getEmbedding`은 유지한다.
- `runClaudeCodeStream`과 `/api/fs/analyze`는 Claude CLI 구독 세션 exec 경로이므로 이번 삭제 대상에서 제외한다.
- AGY bail 구현은 Claude 담당 변경과 충돌하지 않도록 이번 커밋에서 건드리지 않는다.

## 검증

- `node --check server.js`.
- `npm run build:cm`.
