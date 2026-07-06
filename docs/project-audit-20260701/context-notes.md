# eCAMS AI 프로젝트 감사 기록

## 2026-07-01

- 사용자는 현재 실제 AI 질문에는 AGY만 사용하고 있다고 설명했다.
- 사용자는 Claude Code printmode는 소스뷰어의 소스분석에서만 사용 중이라고 설명했다.
- 사용자는 기존 AI 질문 모델이 3.5 Flash 계열이었다고 설명했다.
- Codex 도입 후 OpenAI GPT 계열 모델을 exec 방식으로 사용하는 방안도 함께 검토하기로 했다.
- 이번 단계는 코드 수정이 아니라 프로젝트 파악과 문제점 감사가 목적이다.

## 2026-07-01 감사 결과

- `public/index.html`의 채팅 전송 경로는 모델 선택값을 `agy`로 고정한다. 따라서 일반 AI 질문은 AGY만 사용한다는 사용자 설명과 코드가 일치한다.
- `server.js`의 `/api/chat` 라우터에는 아직 `gemini`, `claude`, `deepseek`, `gpt5-mini`, `o3-mini`, `sonnet+haiku` 분기가 남아 있다. 현재 프론트가 `agy`만 보내므로 운영 hot path는 아니지만 유지보수상 dead path다.
- `server.js`의 `/api/fs/analyze`는 소스뷰어 분석 전용 엔드포인트이며 `claude -p --model claude-sonnet-4-6 --max-turns 1`을 lean 모드로 실행한다. Edit, Write, MultiEdit, NotebookEdit, Bash, Read, Grep, Glob를 모두 `--disallowedTools`로 막는다. 따라서 Claude Code printmode가 소스뷰어 소스분석에만 쓰인다는 설명이 코드와 일치한다.
- `docs/source-viewer-upgrade`에도 소스분석 LLM은 Claude CLI lean spawn이고 RAG용 `getSystemPrompt()`를 쓰지 않는다고 기록돼 있다.
- `docs/agy-perf-redesign`은 운영 모델을 AGY print 모드 단독으로 확정하고, Claude/Gemini/DeepSeek/Sonnet+Haiku 분기를 운영 dead path로 판단한다.
- AGY 병목은 `logs/agy_debug.log`와 기존 문서 기준으로 여전히 존재한다. 최근 로그에도 70초, 144초, 295초, 309초 실행과 `timed out waiting for response`, `waiting for the search task to complete` 계열 tail이 보인다.
- `runAgyOnce`는 `node-pty`와 `agy.exe -p`를 사용한다. prompt를 `scratch/agy_prompt_<uuid>.txt`에 쓴 뒤 AGY가 읽게 하고, 결과는 buffered send 방식이다. usage는 `null`이다.
- AGY는 `.shadow/workspace`와 `.shadow/wiki`, `.shadow/indexes`를 통해 원본 수정 위험을 낮춘다. 다만 과거 문서 기준으로 셸 도구가 add-dir 밖을 볼 수 있는 위험이 남아 있었고, `--sandbox`의 셸 파일시스템 제한 효과는 미검증으로 남아 있다.
- `clarifier.js`는 `gemini-3.1-flash-lite`를 되묻기 모델로 사용한다. 이 모델은 답변 모델이 아니라 모호성 판단과 되묻기용이다.
- `server.js`에는 `gemini-2.5-flash` CLI 경로가 남아 있다. 현재 일반 AI 질문 hot path는 아니지만 모델/운영 현실과 어긋난 dead path다.
- 기존 `gpt5-mini`와 `o3-mini`는 OpenAI 공식 API가 아니라 OpenRouter 호환 Chat Completions 경로인 `runDeepSeekStream`으로 연결돼 있다. `gpt5-mini`는 `openai/gpt-5-mini`, `o3-mini`는 `openai/o3-mini` 모델 문자열을 사용한다.
- OpenAI 공식 문서 기준으로 GPT-5.5는 최신 모델 가이드에 존재한다. 새 구현은 Chat Completions보다 Responses API가 권장된다.
- GPT-5.5를 도입한다면 기존 `runDeepSeekStream`에 모델명만 추가하기보다 별도 `runOpenAIResponsesStream` 또는 작은 exec adapter를 만들어 `/v1/responses`를 호출하는 방식이 낫다.
- 현 package에는 `openai` SDK가 없다. 최소 변경은 `axios`로 Responses API를 직접 호출하는 방식이고, 이후 안정화되면 SDK를 도입할 수 있다.
- `graphify-out`에는 `manifest.json`만 있고 `GRAPH_REPORT.md`나 `graph.json`은 없다. 따라서 graphify 질의 기반 프로젝트 지도는 현재 사용할 수 없다.
- `node --check server.js`와 `npm run build:cm`은 통과했다. `npm run build:cm`은 `public/cm.bundle.js`에 diff를 만들지 않았다.

## 2026-07-01 추가 제약

- 사용자는 API 키 방식은 무료 API 키 외에는 전부 사용하지 않겠다고 확정했다.
- 현재 허용되는 API 키 사용처는 AGY 답변 전 되묻기와 임베딩 보조에 쓰는 무료 Gemini 키뿐이다.
- 그 외 OpenRouter, DeepSeek API, OpenAI API 키 기반 경로는 삭제해도 되는 대상으로 분류한다.
- 이전 감사에서 제안한 `runOpenAIResponsesStream` 방식은 공식 API 관점의 기술 판단이었지만, 현재 비용 제약과 맞지 않는다. 따라서 GPT 계열 도입안은 API 호출이 아니라 구독 세션 기반 exec 방식으로 재분류한다.
- GPT exec 방식은 월구독 범위 안에서만 쓰는 것을 목표로 한다. 구현 전 실제 CLI가 API 키 없이 구독 세션 인증으로 호출 가능한지 probe해야 한다.
- `server.js`의 `runDeepSeekStream`, OpenRouter 기반 `gpt5-mini`와 `o3-mini`, Gemini CLI 답변 경로는 운영 제약상 제거 후보로 본다.
- 무료 Gemini 키 기반 `clarifier.js`와 embedding 경로는 남기되, 장애 시 AGY로 graceful fallback하는 정책을 유지한다.

## 2026-07-01 Claude 판단 대조

- Claude의 "유료 키 소비 진입점은 `runDeepSeekStream` 단일 함수" 판단은 맞다. `.env`에서 `DEEPSEEK_API_KEY`를 읽고, `deepseek`, `deepseek-v3`, `gpt5-mini`, `o3-mini`가 모두 `runDeepSeekStream`으로 들어간다.
- Claude의 삭제 순서 중 유료 분기 4개 제거, `runDeepSeekStream` 제거, `.env`의 `DEEPSEEK_API_KEY` 제거는 타당하다.
- Gemini 답변 경로 `runGeminiOnce`와 `runGeminiStream` 제거는 타당하지만, `GEMINI_KEY`, `clarifier.triage`, `getEmbedding`은 무료 되묻기와 임베딩 보조라 유지해야 한다.
- AGY hot path는 `/api/chat`에서 `clarifier.triage`, 캐시, `buildPrompt`, `runAgyWithRetry`로 이어지고, 유료 모델 분기들은 형제 `if` 블록이라 기계적으로 제거 가능하다는 판단도 맞다.
- 단, Claude가 지적한 것처럼 `modelInput` 기본값이 `claude`이고 catch-all fallback이 `runClaudeCodeStream`인 점은 제거 작업의 실제 위험 지점이다. 프론트가 AGY 고정이어도 백엔드는 방어적으로 `agy` 기본값 또는 400 응답을 명시해야 한다.
- `runClaudeCodeStream`과 `sonnet+haiku`는 API 키 방식은 아니지만 일반 질문 hot path가 아니므로 GPT exec probe 결과와 함께 별도 존치 여부를 판단한다.
- Codex exec probe는 아직 미검증이다. `Get-Command codex`는 Windows 앱 번들 `codex.exe`를 찾지만, `codex --help`는 일반 실행과 권한 상승 실행 모두 `Access is denied`로 실패했다.
- 따라서 "Codex CLI가 GPT exec 담당"이라는 방향은 역할상 맞지만, 현재 환경에서 CLI 실행 가능성부터 별도 해결해야 한다.
- 우선순위는 Claude 의견대로 병렬이 적합하다. Codex는 dead path 제거 계획을 기계적으로 다듬고, Claude는 AGY bail 설계를 깊게 보는 분담이 맞다.

## 2026-07-01 Claude Code 검토 (키 인벤토리 + 삭제 순서)

- `.env` 실측 결과 키는 3종뿐이다. `GEMINI_API_KEY_1`(무료 Gemini), `DEEPSEEK_API_KEY`(값이 `sk-or-v1-...` 즉 OpenRouter 키), VAPID 푸시 키 2개.
- `ANTHROPIC_API_KEY`와 `OPENAI_API_KEY`는 `.env`에 없다. 따라서 `runClaudeCodeStream`과 소스뷰어 `/api/fs/analyze`의 `spawn('claude')`는 `env:{...process.env}`를 넘겨도 주입되는 API 키가 없어 Claude CLI 구독 세션(exec)으로 동작한다. 유료 API 키 경로가 아니다. 이번 삭제 대상에서 제외한다.
- 이 사실은 Q3의 선례다. Claude printmode가 이미 "API 키 없이 구독 세션 exec"로 실동작 중이므로, GPT/Codex도 같은 방식이 가능한지만 probe하면 된다.
- 유일한 유료 API 키 경로는 OpenRouter `DEEPSEEK_API_KEY` 하나다. 이 키를 소비하는 진입점은 `runDeepSeekStream` 단일 함수이고, dispatch의 `deepseek`/`deepseek-v3`/`gpt5-mini`/`o3-mini` 4개 model 값이 전부 이 함수를 공유한다.
- dead path는 전부 `if (model === X) return await ...` 독립 블록(2674~2698)이라 AGY 분기(2675)와 결합이 없다. 개별 제거 가능하다.
- 실제 리스크는 catch-all fallback(2698 `return runClaudeCodeStream`)과 진입부 기본값(2749 `modelInput='claude'`, 2765 매핑)이다. 프론트는 agy 고정이지만 방어적으로 agy fallback 또는 400을 명시해야 한다.

### 삭제 순서 (위험 낮은 것부터, 코드 수정은 합의 후)

1. dispatch에서 유료 분기 4개 제거 (deepseek, deepseek-v3, gpt5-mini, o3-mini) + 해당 modelLabel 4줄(2655~2659) + 진입부 매핑(2768) 제거.
2. `runDeepSeekStream` 함수 본체(2211~) 제거.
3. `.env`의 `DEEPSEEK_API_KEY` 제거.
4. gemini 답변 경로 제거 (runGeminiStream/runGeminiOnce, model==='gemini' 분기 2674, modelLabel 2654). 단 무료 GEMINI_KEY, clarifier.js, getEmbedding은 유지.
5. catch-all fallback(2698)을 agy fallback 또는 400으로 변경, 진입부 기본값 정리.
6. runClaudeCodeStream / sonnet+haiku는 구독 세션이라 유료 삭제 대상 아님. chat에선 dead지만 소스뷰어 analyze와 성격 동일. 존치 여부는 GPT exec probe 결과와 함께 별도 판단.

### 우선순위 (bail vs dead path) — 병렬

- dead path 삭제와 AGY bail은 독립이다. bail은 runAgyOnce/node-pty/백그라운드 검색 안에서 나고 형제 if-블록 삭제는 이 표면을 안 건드린다. 삭제가 bail을 unblock하지 않는다.
- 따라서 직렬(삭제 먼저)이 아니라 역할 병렬로 간다. Codex = dead path 기계적 제거(저위험), Claude = bail 설계(P0 실제 통증).

### GPT exec probe 기준

- OpenAI 구독(ChatGPT) 세션 기반 CLI는 `codex`(Codex CLI)다. probe는 Codex가 로컬에서 담당한다.
- 검증 기준. (1) `OPENAI_API_KEY` env 비운 상태에서 구독 로그인만으로 non-interactive 실행(`codex exec` 계열)이 exit 0 + 답변 텍스트를 내는가. (2) stdin→stdout 캡처가 되는가(runAgyOnce처럼 pty 필요한지). (3) 결정적 기준은 exit 0가 아니라 과금이다 — 구독 범위 내인지 vs 토큰 미터링 별도 과금인지 확인.
- CLI 플래그는 기억으로 단정하지 말고 실제 `codex --help`로 확인한다.

## 우선 문제 목록

- P0. AGY print 모드가 백그라운드 검색을 끝까지 기다리지 않고 조기 종료하는 bail 문제가 핵심 병목이다.
- P0. AGY 성공 케이스도 1분에서 5분까지 걸리는 로그가 있어 사용자 체감 속도가 불안정하다.
- P0. buildContext와 entity index 배선은 일부 개선됐지만, `docs/agy-perf-redesign` 기준 실 UI E2E가 아직 미검증이다.
- P1. v2 도메인 사전의 file:line 인용 drift가 AGY 재검색과 bail을 유발할 수 있다.
- P1. `server.js`가 한 파일에 라우터, 모델 실행, 캐시, 권한, 프롬프트, 작업 큐까지 몰려 있어 변경 위험이 크다.
- P1. 운영 hot path는 AGY인데 백엔드에는 여러 모델 dead path가 남아 있어 판단과 테스트 범위를 흐린다.
- P1. OpenAI GPT-5.5 도입을 API 키 경로에 얹으면 사용자 비용 제약과 충돌한다. exec 방식 probe가 먼저 필요하다.
- P2. semantic cache, answer cache, guide knowledge, entity index가 모두 Gemini embedding 키에 의존한다. 무료 키 장애 시 회피 전략이 제한적이다.
- P2. 소스뷰어 분석은 실제 로그인 브라우저 E2E가 아직 사용자 검증 대기 상태다.
- P2. graphify 결과물이 불완전해서 프로젝트 지식 그래프를 협업 분석 근거로 쓰지 못한다.
- P2. 저장 JSON과 문서 일부에서 mojibake가 보인다. 코드 동작과 별개로 다음 에이전트의 독해 비용을 크게 올린다.

## 2026-07-01 Codex-Claude 합의 반영

- Claude Code의 `to-codex.md` 검토를 받아 AGY bail 원인을 `isAgyBail`의 판정 결함으로 구체화했다. `exitCode!==0`인 timeout 실패가 3125자 영문 계획 출력 때문에 `>300자` 정상 판정을 통과하고, 최종 답변으로 노출되는 경로가 핵심이다.
- `--print-timeout 5m`은 유지하기로 합의했다. 292초짜리 정상 한글 답변이 있으므로 per-attempt timeout을 줄이면 느린 성공 케이스를 실패로 바꿀 위험이 있다.
- bail 수정안은 `exitCode`와 한글 유무를 판정에 포함하고, 전체 재시도 wall-clock 예산을 둔 뒤, timeout 실패는 nudge 재시도 대신 사용자에게 질문 범위를 좁히라는 명확한 안내를 내는 방향이다.
- 유료 API dead path 제거는 승인됐다. 다만 catch-all fallback과 `modelInput='claude'` 기본값 정리는 마지막이 아니라 `deepseek/deepseek-v3/gpt5-mini/o3-mini` dispatch 제거와 같은 첫 커밋에 포함한다.
- 삭제 대상은 OpenRouter `DEEPSEEK_API_KEY`를 쓰는 `runDeepSeekStream` 계열과 Gemini 답변 경로다. 무료 Gemini 되묻기와 임베딩 보조 경로는 유지한다.
- `runClaudeCodeStream`과 `/api/fs/analyze`는 API key 경로가 아니라 Claude CLI 구독 세션 exec 경로이므로 이번 삭제 대상에서 제외한다.
- GPT exec probe는 Codex CLI가 현재 `Access is denied`로 막혀 있어 보류한다. 환경 권한 문제를 먼저 해결해야 한다.
- 사용자는 첫 AGY 시도가 5분 안에 정상 답변을 못 내고 timeout으로 종료되면 재시도하지 않고 질문 범위를 좁혀달라는 정적 안내를 반환하는 방향을 승인했다.
