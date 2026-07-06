# Plan — Claude Code ↔ Antigravity 2.0 협업 환경 + agy CLI 통합

> **이전 작업 연결고리**: 이 feature 는 [`wiki-poc/`](../../wiki-poc/) (결정 1~61) → [`repo-map-poc/`](../../repo-map-poc/) (결정 62~68) 의 후속이다. agy 통합은 **결정 69** 자리에 해당하지 않는 새로운 갈래 — repo-map PoC 의 운영 라우터(Sonnet/Haiku)에 **flash 3.5 옵션을 한 칸 추가**하는 작업이다. repo-map PoC 의 "결정 69 후보 (Sonnet+Haiku 회복 vs 결정 71 운영 도입)" 와는 독립적으로 진행 가능.

## 1. 배경 / 목적

ecams-ai 소스를 git으로 관리하기 시작하면서, 두 종류의 AI 코딩 도구가 **같은 레포에서 같은 규칙**을 따라 협업하도록 셋업한다.

- **Claude Code** (현재 사용 중) — 세션 시작 시 `.claude/CLAUDE.md` 자동 로드
- **Antigravity 2.0** — 세션 시작 시 `AGENTS.md` 자동 로드 (사용자 확정)

또한 `server.js`의 RAG 응답 파이프라인에 **`agy` (Antigravity CLI) flash 모델 분기**를 추가해서, 기존 Gemini/Claude 옵션과 나란히 선택 가능하게 만든다.

## 2. 작업 두 갈래

### A. 공유 컨텍스트 셋업 (이번 세션)

목표: 두 도구가 동일한 행동 가이드라인을 따르도록, 공통 본문을 **단일 파일**에서 관리.

- `AGENTS.md` 신규 작성 — 공통 본문 (현 `.claude/CLAUDE.md` 의 10개 행동 가이드라인 + `MEMO.md` 먼저 읽기 지시).
- `.claude/CLAUDE.md` 를 `@AGENTS.md` import 한 줄로 축소. 클로드 전용 추가 사항은 그 아래에 append.
- `.clauderules` 는 폐기 후보 (지시 내용이 AGENTS.md로 이전됨). 일단 보존하고 안내 메모만.
- `MEMO.md` 는 그대로 (휘발성 상태 자동 생성).

### B. agy 통합 (다음 세션)

목표: `server.js` 응답 라우터에서 `model === 'agy'` 분기를 추가해서, 사용자가 안티그래비티 flash 모델로 질문하면 `agy` CLI를 spawn해 답을 받아온다.

핵심 호출 패턴 (검증 완료 — `context-notes.md` 참고).

```js
// 1. fullPrompt를 임시 파일로 떨어뜨림
const promptFile = path.join(__dirname, 'scratch', `agy_prompt_${uuid}.txt`);
fs.writeFileSync(promptFile, fullPrompt, 'utf8');

// 2. agy spawn — 파일 풀 경로 + --add-dir 워크스페이스 부여
const args = [
  '--add-dir', cwd,
  '--dangerously-skip-permissions',
  '--print-timeout', '5m',
  '-p', `${promptFile} 파일을 읽고 그대로 지시에 따라 답해줘.`
];
const proc = spawn(agyExePath, args, { ... });

// 3. stdout 캡처 → 클라이언트로 stream
// 4. 임시 파일 정리
```

기존 [server.js:1348-1399](../../server.js#L1348-L1399) `runGeminiOnce` 패턴을 그대로 따르되, 차이점.

| 항목 | Gemini | agy |
|---|---|---|
| prompt 전달 | stdin (`proc.stdin.write`) | 임시 파일 + `-p` 인자에 경로 지시 |
| 스트림 형식 | `--output-format stream-json` | 일반 stdout (포맷 옵션 없음) |
| 권한 우회 | `--yolo --skip-trust` | `--dangerously-skip-permissions` |
| 모델 지정 | `-m gemini-2.5-flash` | 모델 옵션 없음 (CLI 기본 = flash 3.5) |

## 3. 성공 기준

### A. 공유 컨텍스트
- 안티그래비티에서 새 세션 열었을 때 `AGENTS.md` 의 10개 원칙이 실제로 적용되는지 확인 (한국어 마침표 규칙, 파일 헤더 코멘트 등으로 사후 검증).
- 클로드 코드 새 세션에서 `.claude/CLAUDE.md` → `@AGENTS.md` import가 정상 작동.

### B. agy 통합
- `server.js` 재기동 후 사용자가 모델 = `agy` 선택해 질문 → flash 3.5 응답 정상 반환.
- 응답 latency, 토큰 사용량 측정해서 기존 Gemini/Claude 옵션과 비교 가능한 형태로 로그 출력.

## 4. 위험 / 미해결

- **agy 인자 escaping**: 임시 파일 경로에 공백이나 한글이 들어가면 cmd escape 이슈 가능. `scratch/` 하위 ASCII 파일명으로 고정해서 회피.
- **agy 의 stdout 포맷**: stream-json 옵션이 없어서 토큰 단위 streaming UI 구현 어려움. 일단 응답 전체 받은 후 한 번에 전송하는 방식으로 시작.
- **agy 콜드 스타트**: 첫 호출 시 인증/세션 셋업으로 수십초 걸릴 수 있음. `--print-timeout 5m` 로 충분히 길게 설정.
