# Context Notes — 결정 근거 / 검증 결과

작업하면서 내린 결정과 그 이유. 다음 세션이 재구성 없이 이어갈 수 있도록 누적.

---

## 2026-06-01 — 초기 셋업 세션

### 결정 1. 공유 본문은 `AGENTS.md`

**선택**: 두 도구가 공통으로 읽을 본문은 `AGENTS.md`.
**대안**: `.windsurfrules`, `.antigravity/rules`, 별도 `shared-instructions.md` 등.
**이유**: 사용자가 "AGENTS.md로 하면 될 것 같아"로 확정. Google 측 컨벤션 (Antigravity가 Google 제품) 과 가장 자연스러움.

### 결정 2. `.claude/CLAUDE.md` 는 import 한 줄로 축소

**선택**: `.claude/CLAUDE.md` 본문을 모두 AGENTS.md로 이관하고, CLAUDE.md 는 `@AGENTS.md` import 한 줄만 남김 (+ 클로드 전용 추가사항이 생기면 그 아래).
**이유**: 본문이 두 군데로 분산되면 동기화 부담. 클로드는 `@file.md` import를 공식 지원 (사용자의 글로벌 `~/.claude/CLAUDE.md` 도 `@RTK.md` 사용 중).

### 결정 3. `MEMO.md` 는 AGENTS.md 와 분리

**이유**: `MEMO.md` 는 `gen_memo.js` 가 자동 갱신하는 휘발성 상태 (최근 변경 파일, 현재 골 등). AGENTS.md 같은 정적 규칙 파일과 섞으면 매 커밋마다 충돌 가능. AGENTS.md 에는 "세션 시작 시 MEMO.md 를 먼저 읽으라"는 **지시만** 포함.

### 결정 4. `.clauderules` 폐기 (2026-06-01 확정)

**경위**: 처음엔 일단 보존하기로 했으나, 사용자 확인 후 폐기 결정. `git rm` 으로 제거.
**이유**: 
- 클로드 코드는 `.clauderules` 를 자동 로드하지 않음 (자동 로드는 `.claude/CLAUDE.md`).
- 안티그래비티도 `.clauderules` 를 읽지 않음 (AGENTS.md 만 자동 로드).
- 같은 지시(`MEMO.md 먼저 읽기`)는 AGENTS.md 0번 섹션으로 이전됨.
- Cursor 등 다른 도구를 추가로 도입하면 `.cursorrules` 등 도구별 파일을 별도 만드는 게 깔끔.

### 결정 5. agy 호출은 stdin이 아닌 "임시 파일 + `-p` 인자에 경로" 방식

**선택**: 임시 prompt 파일을 만들고 `agy -p "<풀경로> 파일을 읽고 답해줘"` 식으로 지시.
**대안 (탈락 1)**: Gemini 처럼 stdin 으로 전달 — agy CLI는 stdin 안 받음.
**대안 (탈락 2)**: `agy -p "<prompt 통째>"` 인라인 — Windows cmd 인자 길이 (~32KB)와 따옴표/줄바꿈 escape 함정 때문에 큰 prompt 위험.
**대안 (탈락 3)**: `agy -p "@scratch/file.txt"` 자동 첨부 문법 — **부분적으로 동작하나 매우 비효율**.

**검증 결과 (2026-06-01)**:
- (1) `agy -p "Reply with exactly: SMOKE_OK"` → 즉시 `SMOKE_OK` 응답. OK.
- (2) `agy -p "@scratch/agy_test_prompt.txt"` → LLM이 파일을 직접 inline 하지 않고, 자기 도구(`ListPermissions`, `where`, Python 스크립트 등) 로 30+ 번 탐색 끝에 도달. 결과는 맞지만 토큰/시간 대량 낭비.

따라서 **풀 경로를 prompt 본문에 박고 `--add-dir` 로 워크스페이스 명시**하는 방식이 효율적. LLM이 헤매지 않게 답을 미리 알려주는 형태.

### 결정 6. agy 콜드 스타트 / 인증 이슈

**증상**: PowerShell `Start-Process` / `cmd /c` 로 agy를 spawn했을 때 exit 0인데 stdout 비어있음 (silent fail). 같은 명령을 사용자 cmd 세션에서 직접 돌리면 정상.
**가설**: agy 가 TTY 또는 사용자 세션 인증 컨텍스트에 의존. 백그라운드 spawn은 별도 검증 필요.
**대응 (다음 세션)**: server.js 통합 시, Node `spawn` 에 `windowsHide: true` + `--dangerously-skip-permissions` 조합으로 시도. 안 되면 사용자에게 어떤 환경 변수/세션 토큰 필요한지 디버깅 요청.

### 결정 7. agy 인자 escaping 안전장치

**규칙**: 임시 prompt 파일명은 `scratch/agy_prompt_<uuid>.txt` 처럼 ASCII만 사용. 공백/한글 경로는 cmd escape 함정 트리거.

### 결정 8. `.claude/CLAUDE.md` 의 import 표기는 `@../AGENTS.md`

**선택**: 상대 경로로 `@../AGENTS.md` 사용.
**미검증 가정**: Claude Code 의 `@<path>` import 가 상대 경로(`../`) 를 지원함. 공식 문서상 임의 경로 지원 명시는 있으나, 이 레포에서 실제로 동작하는지는 다음 세션 시작 시 확인 필요.
**폴백**: 작동 안 하면 (A) 절대 경로 (`@/AGENTS.md`?) 시도 (B) AGENTS.md 본문을 `.claude/CLAUDE.md` 에도 복사하고 동기화는 수동 관리.

### 결정 9. AGENTS.md 본문에서 영어 콜론은 그대로 보존

**경위**: 처음 작성 시 5번 원칙(한국어 콜론 금지)을 영어 문장에까지 잘못 적용해서 `The test:` → `The test.` 식으로 변형. **3번 원칙(Surgical Changes — Match existing style) 위반**으로 즉시 원복.
**규칙**: 5번 원칙은 **한국어 문장 한정**. 영어 문장의 콜론은 정상 용법이므로 손대지 않는다.

### 결정 10. 누적 결정 기록 안내를 AGENTS.md + plan.md 에 추가

**경위**: 첫 커밋 직후 사용자가 "결정 1~68 누적 기록이 plan.md 에 빠졌다"고 지적. 처음에 `wiki-poc/` 가 git untracked 라고 잘못 진단했으나, **`git ls-files` 로 확인 결과 wiki-poc/ 와 그 하위 context/ out/ scripts/ 모두 이미 tracked 상태**. 결정 본문 보존 자체는 이미 완료된 상태였음.
**진짜 문제**: 결정 본문이 git 에 있지만 **다음 세션이 그 위치를 모를 가능성**. AGENTS.md 와 agy-integration/plan.md 어디에도 "결정 1~68 본문은 wiki-poc/ + repo-map-poc/ 에 있음" 안내가 없었음.
**처리**:
- `AGENTS.md` 0번 섹션에 "누적 결정 기록 (결정 1~68)" 안내 추가 — wiki-poc/ + repo-map-poc/ 위치와 각 폴더에 담긴 결정 범위 명시.
- `agy-integration/plan.md` 상단에 "이전 작업 연결고리" 한 줄 추가 — 이 feature 가 결정 69 자리 아닌 독립 갈래임을 명시.
- `.gitignore` 에 `wiki-poc/{context,out,scripts}/` 명시적 제외 추가. **이미 tracked 인 파일은 영향 없음** (gitignore 는 미래 신규 파일만 막음). 향후 PoC 재실행으로 생기는 결과물이 실수로 add 되는 사고 방지 효과만.

### 검증 못한 항목 (다음 세션 처리)

- ~~Claude Code 가 `.claude/CLAUDE.md` 내 `@../AGENTS.md` 를 실제로 inline 하는지~~ → **2026-06-01 확인됨**. 이 세션이 시작될 때 시스템 프롬프트에 AGENTS.md 본문이 그대로 로드되어 inline 작동 확인.
- ~~agy `--add-dir` 다중 지정 동작~~ → **2026-06-01 확인됨**. `agy --help` 결과 `--add-dir Add a directory to the workspace (repeatable)`. **Gemini 의 comma-join (`A,B`) 과 다른 repeatable 형식** (`--add-dir A --add-dir B`).
- ~~agy stdout 의 정확한 포맷~~ → **2026-06-01 확인됨**. ANSI escape codes 가 섞인 raw text (예. `\x1b[?9001h`, `\x1b]0;...title...\x07`). `stripAnsi()` 헬퍼로 제거.
- agy 응답 도중 취소 처리 (SIGINT) — 미검증
- agy 비용/토큰 계측 출력 여부 — 미확인. `usage: null` 로 elapsed 이벤트 전송.

---

## 2026-06-01 (오후) — agy 통합 구현 세션

### 결정 11. agy spawn 은 **반드시 node-pty** 사용 (raw `child_process.spawn` 불가)

**경위**: 결정 6 (silent fail 가설) 을 정량 검증 → **확정 사실**. Node `spawn` 4종 변형 (`shell: true/false`, `windowsHide: true/false`, `stdio: ['ignore','pipe','pipe']` / `['pipe','pipe','pipe']`) 모두 실패.
- exit code 0 이지만 stdout/stderr 모두 0 byte
- `--log-file` 옵션으로 agy 내부 로그 추적 결과. 인증 성공 → `streamGenerateContent` API 호출 시작 → **응답 청크 도착 전 즉시 셧다운** ("CLI store manager shutting down")
- 가설. agy 가 stdout 이 실제 TTY 가 아니면 응답 streaming 중단
- 백그라운드 PowerShell (`-NonInteractive`) 호출도 같은 silent fail (3분 hang, 0B)

**해결**: `node-pty` 도입 → ConPTY (Windows 가상 TTY) 로 agy 띄움. probe 결과 7.8초 만에 `PROBE_OK` 정상 수신.

**비용**: `node-pty` 는 native module 이지만 prebuilt 바이너리 존재. `npm install node-pty` 2초 만에 완료, 추가 빌드 도구 불필요.

### 결정 12. agy 응답은 buffered send (incremental streaming 안 함)

**선택**: `term.onData` 로 누적만 하고, `onExit` 에서 한 번에 `res.write` 로 클라이언트에 전송.
**대안**: chunk 도착할 때마다 `type: 'text'` 이벤트 streaming.
**이유**: 
- agy 출력은 ANSI escape + 진행 status 라인 + 최종 응답이 섞여 있어 chunk 경계로는 의미 단위 분리 불가
- `stripAnsi` 후 trim 한 최종 결과만 의미 있음
- 결정 5의 "응답 전체 받은 후 한 번에 전송하는 방식으로 시작" 유지

**리스크**: 사용자 입장에서 응답 표시까지 wait time 김 (Gemini token streaming 과 UX 차이). 필요 시 향후 ANSI clean 후 line-based streaming 로 개선 가능.

### 결정 13. 임시 prompt 파일 자동 cleanup

**구조**: `runAgyOnce` 진입 시 `scratch/agy_prompt_<uuid>.txt` 생성 → `onExit` 콜백에서 `fs.unlinkSync` (try/catch 로 보호).
**미해결**: 프로세스 crash / 강제 종료 시 잔여 파일 → known acceptable. 매번 UUID 파일명이라 충돌 없음, scratch/ 디렉토리는 어차피 휘발성.

### 결정 14. agy 의 cost/usage 측정은 보류 (현재 `usage: null`)

**상태**: agy CLI 가 토큰/비용 정보를 stdout 으로 노출하는지 미확인. 일단 `{ type: 'elapsed', seconds, usage: null }` 로 응답해서 UI 의 사용량 표시는 비어있음.
**다음**: `--log-file` 내용을 파싱해서 토큰 사용량 뽑을 수 있는지 차후 조사.

### 결정 16. `AGY_EXE` 경로는 하드코딩 (portability 미보장)

**현 값**: `C:\Users\ecams\AppData\Local\agy\bin\agy.exe` — 개발자 홈 디렉토리. 다른 사용자 머신에서는 PATH 또는 환경변수로 해결해야 함.
**다음**: 환경변수 `AGY_EXE_PATH` 로 override 가능하도록 변경 검토. 현재는 단일 머신 PoC 라 보류.

### 결정 17. prompt 파일 경로는 forward slash 로 정규화

**경위**: `path.join` 결과는 Windows 백슬래시. 이걸 LLM 한테 그대로 텍스트로 넘기면 escape 모호성 (LLM이 `\u`, `\t` 같은 시퀀스로 오해할 위험).
**해결**: `-p` 인자 안에서 `promptFile.replace(/\\/g, '/')` 로 변환. Node `fs` 와 agy Read tool 모두 forward slash 정상 인식.
**Reference**: advisor 제안.

### 결정 18. (검증) 실 호출 manual test 통과 — 2026-06-01

**테스트**: 서버 재기동 → UI 에서 `🌌 Antigravity flash 3.5 (CLI)` 선택 → "사용자정보화면에서 cm_active 언제언제 변경돼?" 1회 호출.
**결과**.
- 응답 도착, 마크다운 5섹션 구조의 구체 답변 (CMM0040 테이블 분석, setUserInfo/delUserInfo SQL 인용, 시나리오 A/B 분리)
- ANSI escape codes 안 보임 (stripAnsi OK)
- agy 의 tool-use progress / status 노이즈 안 섞임 (advisor 우려 #3 회피됨 — `-p` print 모드가 progress 채널 분리하는 듯)
- 답변 품질은 Gemini/Claude 와 동등하거나 유사 (도메인 정확도 양호)
**남은 관찰**: 첫 호출 latency 측정값 미수집. 차후 사용 중 elapsed log 로 추적.

### 결정 15. 이미지 첨부 처리 보류

**상태**: Gemini 는 prompt 의 `# 첨부 이미지\n경로` 를 `@경로` 문법으로 변환해서 첨부. agy 의 이미지 첨부 문법은 미확인.
**현 동작**: agy 분기는 prompt 변환 없이 그대로 전달. 이미지 prompt 들어오면 텍스트로만 처리됨 (이미지 무시될 가능성).
**다음**: 이미지 분석이 필요한 케이스 나오면 agy CLI 문서/help 추가 조사. → **결정 19 에서 미지원 확정**.

---

## 2026-06-01 (저녁) — agy 이미지 첨부 미지원 검증 + UI 정리

### 결정 19. agy CLI 이미지 첨부 **공식 미지원 확정** (결정 15 후속)

**경위**: 4가지 변형 probe + TUI probe 까지 모두 실패. agy backend 에 vision tool 부재 확정.

**Probe 결과 표**:

| Probe | 방식 | 응답 | 시간 |
|---|---|---|---|
| #1 | 임시 prompt 파일 본문 안에 `@<imgPath>` | `NO_IMAGE_VISIBLE` | 13.5s |
| #2 | `-p` 인자 자체에 `@<imgPath>` 직접 | `NO_IMAGE_VISIBLE` | 15.6s |
| #3 | "이미지 도구가 있냐" 메타 질의 | `NO_IMAGE_TOOL` | 11.3s |
| #4 | "이 이미지 분석해줘 — `<path>`" 명령형 | agy 가 `Get-ChildItem` 으로 파일 메타데이터만 조회 (vision 시도 자체 안 함) | ~15s |
| #5 (TUI) | `agy -i` 대화 모드 → `/?` 명령어 enumerate | 처음 5개 명령어 (`/add-dir, /agents, /artifact, /btw, /changelog`) 에 attach 류 없음. "30 more" 미확인이지만 backend 자체에 vision tool 없으면 의미 없음 | 20.1s |

**Probe 4 의 결정적 증거**: agy 가 이미지 경로 받자 PowerShell `Get-ChildItem` 으로 파일 정보(크기, 날짜)만 조회하고 vision 분석은 시도조차 안 함. 즉 agy backend 의 도구 모음에 **vision tool 자체가 없음**. TUI 도 같은 backend 라 다른 결과 기대 어려움.

**처리**:
- 모델 라우터(`server.js:2061` 부근, `if (model === 'agy')` 분기) 에서 **`imagePath` 변수 직접 체크** → 즉시 안내 응답 후 return. agy spawn 안 함.
- elapsed: '0.0' 으로 즉시 ack — 사용자가 잘못된 모델 선택했음을 빠르게 알 수 있게.

**1차 시도 실패 (정정)**: 처음엔 `runAgyStream` 내부에서 prompt 본문의 `# 첨부 이미지` 정규식 매칭으로 가드했으나 동작 안 함. 원인 — `buildPrompt:1156` 이 실제 추가하는 마커는 `# [이미지 분석 요청]` (경로 없는 마커만). `# 첨부 이미지\n아래 경로...` 형태의 prompt 는 코드 어디에서도 생성되지 않음 (`runGeminiOnce:1411-1415` 의 regex 자체가 dead code). 따라서 **패턴 매칭 대신 `imagePath` 변수 직접 체크가 robust**. 라우터 단계로 가드 이동 + runAgyStream 내부 가드 제거.

**미해결**: agy desktop GUI 앱은 이미지 첨부 가능 (Antigravity 2.0). 즉 backend 차원이 아니라 **CLI surface 한정** 미지원일 가능성도 있음. 그러나 본 PoC 는 CLI 통합이므로 결정 19 범위 밖. 필요 시 후속 PoC.

### 결정 20. UI 모델 selector — OpenRouter API key 호출 모델 숨김

**경위**: 결정 19 처리 직후 사용자 요청 — "지금은 클로드이든 안티그래비티이든 CLI 방식만 사용할거야".

**분류 결과**:
| 모델 | 호출 함수 | 분류 |
|---|---|---|
| claude / haiku / sonnet | `runClaudeCodeStream` | CLI (Claude Code) — 유지 |
| sonnet+haiku | `runClaudeCodeStream` × 2 | CLI (Claude Code 2회) — 유지 |
| gemini | `spawn('gemini', ...)` + GEMINI_API_KEY env | CLI (Gemini CLI) — 유지 |
| agy | `pty.spawn(AGY_EXE, ...)` | CLI (agy) — 유지 |
| **deepseek (R1)** | `runDeepSeekStream` → OpenRouter | **API — 숨김** |
| **o3-mini** | `runDeepSeekStream` → OpenRouter | **API — 숨김** |
| **gpt5-mini** | `runDeepSeekStream` → OpenRouter | **API — 숨김** |

**처리**:
- `public/index.html:1442-1449` 의 `<option>` 3개 삭제 (deepseek, o3-mini, gpt5-mini).
- 백엔드 `server.js` 라우터의 해당 분기는 그대로 둠 (dead branch 지만 사용자 요청은 "안 보이게" 였으므로 surgical change).
- `sonnet+haiku` 라벨에서 "OpenRouter" 표기 제거 — 실제 코드는 Claude Code CLI 2회 호출인데 라벨이 오기였음 (결정 69 잔재).

**Gemini 분류 근거**: `spawn('gemini', ...)` 로 CLI 호출 + GEMINI_API_KEY env. 회색지대지만 호출 형태가 CLI 라 사용자 분류 ("CLI 방식만") 에 부합한다고 판단. 사용자가 "Claude 든 Antigravity 든" 예시로 들었지 Gemini 를 명시적으로 빼라고 하진 않았기에 default 유지. 필요 시 후속 정리.

---

## 2026-06-01 (심야) — agy 이미지 가드 2-stage 흐름 및 편의성 개선

### 결정 21. agy + 이미지 가드 → 2-stage 흐름 도입

**배경**: 결정 19에서 agy CLI가 이미지를 지원하지 않음을 확정함.
**선택**: agy 호출 시 이미지가 포함되어 있으면, 묘사 모델을 먼저 호출하여 이미지를 텍스트로 풀어낸 뒤 그 결과를 agy의 컨텍스트로 주입하는 2-stage 흐름을 도입함.

### 결정 22. 묘사 모델은 Haiku 대신 Sonnet 채택

**경위**: 초기에는 속도를 위해 Haiku를 이미지 묘사 모델로 사용하려 했으나, 검증 과정에서 Haiku의 한글 OCR 실패가 잦음을 확인.
**선택**: 보다 정확한 이미지 인식과 한글 처리를 위해 Sonnet을 묘사 모델로 채택함.

### 결정 23. elapsed 시간은 전체 wall time 으로 표시

**경위**: 2-stage 구조가 되면서 묘사 모델과 agy의 단계별 소요 시간이 분리됨. 이전에는 agy 단계 소요 시간만 표시되는 문제가 있었음.
**선택**: `overallStartTime` 옵션을 경유하여, 전체 프로세스가 소요된 시간(wall time)을 최종 elapsed 로 합산하여 표시하도록 구현함. (목표 소요시간 ~60-65s 로 합산 표출됨을 확인)

### 결정 24. UI 기본 모델을 agy 로 변경

**변경**: `public/index.html` 의 모델 selector 기본값을 `agy`로 지정함.
**이유**: 향후 안티그래비티 기반의 테스트 및 사용 빈도가 높을 것이므로, 사용 편의성을 위해 기본값을 변경함.

### 결정 25. UI 마크다운 렌더링 방식 개선

**문제**: LLM 응답 시 헤더(`## 1.`), 리스트 기호(`*`, `1)`)의 단락 구분이 명확하지 않아 가독성이 떨어짐. 터미널 출력 중 개행 누락 방어 미흡. 절대 경로(`C:/ecams-ai/...`)가 노출되는 보안/시각적 문제.
**해결**: 프론트엔드(`index.html` 의 `formatContent`)의 정규식을 고도화하여 헤더 여백 조정 및 두껍게 강조, 리스트 들여쓰기 적용, 간헐적 개행 소실 방어 로직 추가. 로컬 절대 경로를 찾아 `.../파일명` 형태로 마스킹 처리하여 안전하게 노출.

### 결정 26. 응답 생성 중지 (Stop) 기능 구현

**요구사항**: 답변이 너무 길거나 잘못된 경우 사용자가 즉시 응답을 정지(Abort)할 수 있어야 함.
**해결**: 
- UI: 전송 버튼을 '정지'로 전환하고 `AbortController`를 통해 HTTP fetch 통신 중단.
- 백엔드 (`server.js`): `/api/chat` 라우터에서 `req.on('close')`를 감지하여 연결이 끊기면 `agy`, `claude`, `gemini` 등 자식 프로세스의 `kill()` 메서드나 `deepseek` Axios 통신의 `abort()`를 호출하도록 연결하여 불필요한 서버 자원과 과금을 즉시 차단.

### 결정 27. 답변 템플릿 section 5 "유지보수 참고사항" 에 수정 범위 판정 + 출력 형식 분기 도입 — 2026-06-02

**배경**: 사용자가 "어떻게 수정하는가" 질문 시 기존 section 5 가 "DB 분리 → JS 그리드 수정 → 서버 클래스 수정 → 공통 함수 조정" 같이 추상 단계 나열로만 나옴. 사용자가 "실제 수정해야 할 코드를 diff 로 보여달라" 요청. 단순히 항상 full diff 를 강제하면, DB 스키마 변경 + 공통 함수 + 다중 파일 케이스에서 LLM 이 라인 번호/컨텍스트를 추측하면서 환각 diff 가 양산되는 위험이 큼.

**해결 — section 5 2단계 재구성**:
1. **5-1. 수정 범위 판정** (한 줄로 명시). 4개 자가 점검 기준 중 하나라도 yes → "넓음", 모두 no → "좁음".
   - (1) DB 스키마 변경이 필요한가? (CREATE/ALTER TABLE, 신규 컬럼/인덱스/FK)
   - (2) 공통 함수/공유 유틸을 수정해야 하는가? (다른 모듈도 호출)
   - (3) 3개 이상의 파일을 수정해야 하는가?
   - (4) 함수/메서드 시그니처 변경으로 호출자도 같이 수정해야 하는가?
2. **5-2. 판정별 출력 분기**.
   - 좁음 → unified diff 출력 (` ```diff ` 코드블록, 파일 경로 + 변경 라인 + 인접 컨텍스트 3줄).
   - 넓음 → 3분할. (a) 변경 대상 리스트 (파일/클래스/메서드) (b) 핵심 지점 before/after 스니펫 3~5개 (c) 추가 결정 필요 항목 (PK 설계, 마이그레이션, 호환성 영향 등).
3. **환각 가드**: 라인 번호를 Wiki/Graph/Read 로 확인 못한 경우 좁음 판정 금지. 추측 diff 작성 금지. 라인 위치 모르면 넓음 으로 격상.

**기준 4개를 고른 이유**: RAG 가 답변 한 턴 안에 가진 정보 (wiki 참조 관계, 클래스 메서드 목록, DDL 키워드) 만으로 self-check 가능. 추가 검색 없이 판정 가능해야 latency/턴 수 안 늘어남. 파일 수보다 결합도(스키마/공통 함수/시그니처) 가 우선 신호, 파일 수는 보조 신호로 동작.

**적용 위치**: `server.js` 의 `SYSTEM_PROMPT` (USE_REPO_MAP 미설정 시 기본 모드). REPO_MAP 모드 (`SYSTEM_PROMPT_REPO_MAP`) 는 답변 형식 구조가 달라서 (section 4 가 "미확인 사항") 이번에는 미적용. Gemini/agy/claude/deepseek 등 모든 모델이 `getSystemPrompt()` 를 공유하므로 단일 수정으로 전 모델 적용.

**검증 대기**: 서버 재기동 후 동일 부재등록 질문으로 판정/출력 분기가 의도대로 나오는지 확인 필요. 동일 질문은 `answer_cache.json` 에 24h TTL 로 캐시되므로 옛 답변 히트 가능 — 새 답변 확인하려면 캐시 클리어 또는 질문 약간 변형 필요.

### 결정 28. 첨부 이미지 인라인 표시 + 라이트박스 확대 — 2026-06-02

**배경**: 사진 첨부 후 전송하면 채팅 버블에 `[사진 첨부]` 텍스트만 남고 실제 이미지는 사라져서, 사용자가 어떤 화면을 분석시켰는지 다시 확인할 수가 없었음. 미리보기 영역에서는 이미지를 보다가 전송 직후에만 텍스트로 바뀌는 비대칭 UX.

**해결** (`public/index.html` 단독 수정).
- `appendMessageDOM(role, content, image)` 시그니처 확장. `image` (data URL) 가 있으면 버블 최상단에 `<img class="bubble-image">` 를 박고, 본문 text 에서 `^\[사진 첨부\]\n?` 마커는 시각 중복이라 strip 후 표시.
- `messages.push` 항목에 `image: dataUrl` 도 함께 저장. `loadChat` 에서 `appendMessageDOM(m.role, m.content, m.image)` 로 히스토리 복원 시에도 이미지 그대로 렌더.
- 서버 페이로드 비대화 방지. `history: messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))` 로 image 필드 제거 후 전송. (서버는 기존대로 현재 턴의 `image` 만 LLM 에 인라인.)
- 이미지 클릭 → 풀스크린 라이트박스 (`#imageLightbox`, max 95vw/95vh, 어두운 배경, ESC 또는 외곽 클릭으로 닫힘, 우상단 ✕ 버튼).
- `saveChat` 의 `localStorage.setItem` 을 try/catch 로 보호. quota 초과 (이미지 base64 누적) 시 모든 저장 메시지에서 `image` 필드만 제거 후 재시도. 텍스트 히스토리는 최대한 보존.

**왜 LLM 히스토리에서는 image 를 빼는가**: 첨부 시점 1회만 비전 입력으로 들어가고 (`image: imgData`), 이후 턴들은 텍스트 컨텍스트만 필요. 과거 메시지마다 base64 dataURL 을 매 턴 다시 보내면 토큰/대역폭이 누적 폭증하고 비전 모델이 재해석할 이유도 없음. UI 표시용과 LLM 입력용을 의도적으로 분리.

---

## 2026-06-24 — agy 멀티모달 다이렉트 + 다중 사진첨부 (결정 19/21/22 폐기)

### 결정 29. agy CLI 이미지 미지원(결정 19) 폐기 — agy 1.0.10 멀티모달 확정

**경위**: 사용자가 카카오톡 릴레이 프로젝트에서 agy `-p` 모드 이미지 인식법을 발견. 결정 19(2026-06-01, agy 버전 구)는 미지원 확정이었으나 **agy 버전업(1.0.10)으로 폐기**. 재검증 probe 로 실증.

**probe 재검증 (unguessable 토큰 PNG 로 환각 배제, System.Drawing 생성)**:

| Probe | 조건 | 결과 |
|---|---|---|
| A | 절대경로를 `-p` 인자에 직접 | PASS (토큰 정확 OCR) |
| B | 절대경로를 prompt **파일 본문** 안에 (= 서버 `runAgyOnce` 방식) | PASS |
| C | 이미지가 `--add-dir` **밖**(os.tmpdir) | PASS (`--dangerously-skip-permissions` 로 읽음) |
| D | 한 프롬프트에 경로 **2개** 주입 | PASS (둘 다 인식) — 다중첨부 가능 |

스크립트: `scratch/probe_agy_image_v2.js`, `probe_agy_image_outside.js`, `probe_agy_multi.js`. B 가 PASS 라 서버의 파일-indirection 흐름 그대로 동작 → `-p` 호출방식 변경 불필요. C 가 PASS 라 임시이미지를 add-dir 에 추가할 필요 없음.

### 결정 30. Sonnet 2-stage 묘사 제거 → agy 다이렉트 (결정 21/22 폐기)

**변경** (`server.js`):
- `buildPrompt` 의 단일 `imagePath` → `imagePaths[]` 배열. 본문에 `# 첨부 이미지\n<지시>\n<path1>\n<path2>\n` 줄단위 주입 (모든 모델 공통). 끝 콜론 제거(가이드 §5).
- agy 분기: `if (imagePath)` Sonnet 묘사 블록 **완전 삭제**. 이미지 유무와 무관하게 `runAgyWithRetry(promptStr)` 단일 호출 (buildPrompt 가 이미 경로 주입). → 모델 1회 호출, 코드 단순화, latency 감소(묘사 단계 ~30s 제거).
- `runChatJob`: `images:[{data,mime}]` 받아 N개 임시파일(`ecams_img_<ts>_<i>`) 저장 → `imagePaths[]`, finally 에서 전부 unlink.
- `/api/chat`: `images[]` 신규 파싱 + 단일 `image/imageMime` 하위호환. `cacheEligible`/`캐시 저장 가드` 를 `!image` → `!images.length` 로.
- Gemini 분기: `@<path>` 변환 regex 를 다중경로 블록용으로 갱신 (미사용 모델이나 비파손 유지).

### 결정 31. 프론트 다중 사진첨부 UI

**변경** (`public/index.html`):
- `imageBase64/imageMime` 단일 전역 → `attachedImages[]` (`{data,mime,dataUrl,name}`).
- `fileInput` 에 `multiple`. `handleFile`/드롭 모두 복수 파일 루프. `renderImagePreviews` 로 썸네일 그리드(`.preview-thumb`, 개별 ✕). `removeImage(index)` 개별삭제 / 인자없으면 전체.
- 전송: `images:[{data,mime}]` 배열 POST. 메시지 `image` 필드는 dataUrl **배열**로 저장. `appendMessageDOM` 은 배열/단일문자열 둘 다 렌더(구 대화 호환). 라이트박스/quota strip 그대로 동작.

**검증 상태**: agy 멀티모달 probe 4종 PASS. server.js 전체 init OK(포트만 EADDRINUSE — 라이브 가동중). 인라인 스크립트 컴파일 OK. **실 UI E2E 는 `npx pm2 restart ecams-bot` 후 미검증** (사용자 재시작 필요).
