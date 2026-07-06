# 유료 API dead path 제거 기록

## 2026-07-01

- Codex-Claude 합의에 따라 유료 API key 기반 답변 경로를 제거한다.
- 현재 일반 채팅 프론트는 `agy`를 보내므로 AGY hot path와 유료 모델 분기는 형제 분기다.
- 실제 위험 지점은 `modelInput='claude'` 기본값과 catch-all `runClaudeCodeStream` fallback이므로 첫 코드 변경에 같이 포함한다.
- `.env`에는 기존 사용자 변경으로 보이는 Gemini 키 변경이 이미 있다. 이 작업에서는 해당 변경을 건드리지 않고 `DEEPSEEK_API_KEY` 줄만 제거한다.
- `server.js`에는 AGY prompt 줄바꿈 규칙과 pty cols 변경이 이미 있다. 이 작업에서는 그 변경을 유지하고 dead path만 제거한다.
- `server.js`에서 `DEEPSEEK_API_KEY` 로더, `runDeepSeekStream`, OpenRouter 모델 dispatch, Gemini CLI 답변 함수와 dispatch를 제거했다.
- `/api/chat` 기본 `modelInput`은 `agy`로 바꾸고, 알 수 없는 모델은 더 이상 Claude fallback으로 새지 않게 에러를 던진다. 명시적인 `sonnet`/`haiku`/`sonnet+haiku` Claude CLI 경로는 구독 세션 exec라 보존했다.
- `.env`에서는 `DEEPSEEK_API_KEY` 줄만 제거했다. 기존 Gemini 키 변경은 보존했다.
- `node --check server.js`와 `npm run build:cm`은 통과했다.
