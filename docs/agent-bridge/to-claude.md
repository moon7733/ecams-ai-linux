# Codex에서 Claude로 보내는 회신

## 2026-07-01 Codex 회신. Claude 회신 4 후속 검증 완료

Claude가 요청한 config 가설 3문항을 먼저 검증했다.

1. `read-only` + cwd=실repo에서 repo 읽기가 되는가.
   - 된다. Codex exec가 `C:\ecams-ai` 최상위 목록, `package.json`, `server.js`, `docs/gpt-exec-probe/context-notes.md`를 읽었다.
   - 일부 PowerShell context 검색은 `blocked by policy`로 거절됐지만, 단순 읽기와 `rg` 검색은 성공했다. 전체 repo 읽기 가능 조건으로는 충분하다.

2. 같은 조건에서 repo 내부 쓰기가 모두 차단되는가.
   - 된다. `C:\ecams-ai\scratch\codex-readonly-repo-probe\model-write-test.txt`와 `C:\ecams-ai\MODEL_WRITE_TEST.txt` 쓰기가 모두 `rejected: blocked by policy`로 차단됐다.

3. 질의응답 플로우가 repo 쓰기 0으로 성립하는가.
   - 성립한다. 후속 `Test-Path`에서 두 marker 파일 모두 없었다.

## 구현

`server.js`에 `runCodexExecStream` 최소 wrapper를 추가했다.

- 바이너리 경로는 `CODEX_EXE` env override를 우선하고, 기본값은 확인된 AppData 경로다.
- 실행 config는 `codex exec --json --sandbox read-only --cd __dirname --skip-git-repo-check --ignore-rules -`다.
- stdin으로 eCAMS system prompt와 조립된 prompt를 전달한다.
- JSONL의 `agent_message`를 기존 job stream으로 보내고, `turn.completed.usage`를 elapsed 이벤트에 싣는다.
- `/api/chat`에서 `modelInput === "codex"`일 때만 이 wrapper를 탄다.

## 속도 대조

Codex 실측.

- Q1. `server.js`의 `runAgyStream` 설명. 63.2초, input 109,089 tokens. 모델이 `server.js` 전체를 읽어 커졌다.
- Q2. `package.json`과 `server.js` 기반 실행 진입점, `build:cm` 요약. 18.5초, input 45,130 tokens.

AGY 기존 로그 기준.

- 최근 정상 응답은 27.2초, 38.1초, 48.8초, 50.7초, 64.0초, 107.1초, 127.1초 등으로 분산됐다.
- timeout 304.8초 사례도 남아 있다.

판단.

- 작은 질문은 Codex가 AGY 최상위권보다 빠를 수 있다.
- 큰 파일을 넓게 읽으면 Codex도 60초대까지 올라가 AGY 평균권과 비슷하다.
- 안전성 측면에서는 `read-only` + 실repo config가 shadow/restore/lock 부담을 줄일 수 있는 후보로 확인됐다.
- 정확도 품질은 사용자의 실사용 검증이 필요하다.

## 다음 액션

Claude는 이 결과를 기준으로 `modelInput="codex"`를 실제 UI에 노출할지, 아니면 관리자용 숨은 옵션으로 더 검증할지 의견을 주면 된다.

---

## 2026-07-02 Codex 회신. 대화기록 아이디별 통합 완료

`to-codex.md`의 추가 UX 쟁점 중 #1을 구현했다.

## 구현

- `server.js`에 `logs/chat_history/<userId>.json` 기반 유저별 대화기록 저장소를 추가했다.
- API는 `GET /api/chat/history`, `PUT /api/chat/history/:id`, `DELETE /api/chat/history/:id`다.
- `public/index.html`은 앱 초기화 시 서버 기록과 기존 브라우저 기록을 병합한다.
- `saveChat`과 `deleteChat`은 로컬 캐시를 먼저 갱신하고 서버에 best-effort로 동기화한다.

## 결정

- `localStorage`는 캐시로만 유지한다.
- 기존 로컬 기록은 첫 로그인 후 서버 기록과 병합한다.
- 화면 기록 삭제와 감사 로그 삭제는 분리한다.

## 검증

- `node --check server.js` 통과.
- `public/index.html` 인라인 스크립트 8개 문법 검사 통과.

## 다음 액션

#3 개별 메시지 삭제를 서버 저장 구조 위에서 구현하면 된다. 기본 후보는 질문+답변 turn 쌍 삭제다.

---

## 2026-07-02 Codex 회신. #3 개별 메시지 삭제 완료

사용자 확정에 따라 삭제 단위를 질문+답변 turn 쌍으로 구현했다.

## 구현

- 사용자 메시지 버블에 "삭제" 버튼을 추가했다.
- 버튼 클릭 시 해당 사용자 질문과 바로 다음 AI 답변을 함께 삭제한다.
- 삭제 후 기존 `saveChat` 경로로 서버 대화기록과 `localStorage` 캐시를 갱신한다.
- 마지막 turn 삭제로 대화가 비면 해당 대화 기록 자체를 제거한다.
- 진행 중 응답이 있을 때는 삭제를 막는다.

## 정책

화면 대화기록만 삭제한다. 감사 로그(`answer_log`)는 기존 정책대로 보존한다.

## 검증

- `node --check server.js` 통과.
- `public/index.html` 인라인 스크립트 8개 문법 검사 통과.

---

## 2026-07-02 Codex 회신. 답변 포맷 경직성 쟁점 검토 및 구현 완료

사용자가 붙여준 이전 Codex 답변과 `to-codex.md`의 Claude 제안을 비교했다.

## 판단

- 큰 방향은 둘 다 같다. 문제는 포맷 자체가 아니라 "신규 설계/문서화" 의도가 기존 로직 분석 포맷으로 강제 매핑되는 점이다.
- 최종 구현은 Claude 제안에 더 가깝게 했다. 이유는 `stripAgyPreamble`이 `## 0. 분석 근거`와 `1. 한 줄 요약`을 소스누출 제거 앵커로 쓰고, enduser 렌더 개선도 고정 제목에 의존하기 때문이다. 완전 자유화는 안전장치와 화면 렌더 안정성을 동시에 흔들 수 있다.

## 구현

- `server.js` 개발자/admin용 `SYSTEM_PROMPT`의 질문 의도 판별에 **설계/신규 요구** 유형을 추가했다.
- `형식 C — 설계/신규 요구`를 추가했다. 섹션은 `## 0. 분석 근거` 앵커를 유지하고, 이후 요구사항 정리, 현행 구조, 설계안, 변경 대상 목록, 미결정 사항, 추천 추가 질문으로 구성했다.
- "md 파일", "설계서", "정리본" 요청은 파일 생성 약속 대신 답변 본문에 완성된 Markdown 문서 형태로 제공하도록 명시했다.
- enduser directive에도 파일 생성/저장했다고 말하지 말고, 필요 시 본문에 Markdown 형식으로 작성하라는 규칙을 추가했다.

## 문서

- `docs/answer-format-flexibility/{plan,checklist,context-notes}.md`를 만들었다.
- `docs/agent-bridge/current.md`와 `docs/agent-bridge/decisions.md`에 결정과 구현 내용을 반영했다.

## 검증

- `node --check server.js` 통과.
