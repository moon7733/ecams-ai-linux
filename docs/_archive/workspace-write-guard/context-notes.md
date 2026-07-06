# Workspace 원본 보호 — LLM 에이전트 쓰기 차단 (2026-06-05)

## 문제

"수정해줘" 류 질문 시 답변 생성 에이전트(agy/claude/gemini)가 **실제 workspace 원본 파일을 직접 수정**하는 것이 확인됨.

원인.
- agy/claude 가 `--dangerously-skip-permissions` 로 실행됨 ([server.js] runAgyOnce, runClaudeCodeStream). 모든 도구(Edit/Write) 허용 + 확인 없음.
- agy/gemini 의 cwd 와 `--add-dir` 가 workspace 를 가리킴 → 에이전트가 워크스페이스 안에서 read+write 가능.
- 시스템 프롬프트엔 "읽기만" 이라 써있지만 그건 지시일 뿐, 도구는 켜져 있어 모델이 파일을 고쳐버림.
- 증거. `kjbank_html5` 의 RequestStatus.js/.jsp, Cmd3100.java, PrgListReport.js 가 06-04~05 에 실제 수정됨(mtime). 플러그인(Eclipse/DOMA/RSA)은 깨끗(agy 가 diff 만 출력하고 안 씀). `/api/fs/read` 는 디스크 원본을 그대로 읽으므로 칩 클릭 시 수정본이 보였던 것.

## 조사로 배제한 대안

- agy `--help`. 도구 차단 플래그 **없음**. `--sandbox` 도 실측 결과 파일 쓰기 못 막음(written_by_agent.txt 생성됨).
- `--dangerously-skip-permissions` 제거. 비대화(`-p`) 모드라 빼면 도구 승인 불가 → 읽기까지 깨질 위험(agy-integration 결정 참고).
- persistent(영구) ACL. deny ACE 가 사용자 계정(ecams)에 걸려 **사용자가 자기 IDE 로 workspace 편집하는 것까지 차단** → 부적합. 요청별(에이전트 실행 중에만)로 한정.

## 결정 — 요청별 쓰기거부 ACL + claude 도구 차단

**메커니즘**. 에이전트 실행 동안 분석 대상 repo 루트에 Windows 쓰기거부 ACL 을 걸고, 끝나면 해제.
- `icacls <repoRoot> /deny "<user>:(OI)(CI)(WD,AD,WA)"` — write-data/append-data/write-attributes 만 거부, **읽기는 허용**. (OI)(CI) 상속으로 하위 전체 적용. 루트 1회 호출로 끝(자식 미순회), ~20ms.
- 해제. `icacls <repoRoot> /remove:d <user>`.
- 구현(`server.js`). `denyWorkspaceWrites`/`allowWorkspaceWrites`(refcount 로 동시 작업 안전, MAX_CONCURRENT=3), `repoRootsFor`, `resetLeftoverDenies`(시작 시 크래시 잔여 ACE 정리). 디스패치(`requestQueue.add` 콜백)를 `deny → try { 모델 실행 } finally { allow }` 로 감쌈 — 정상/예외/취소 모두 원복.
- agy/gemini cwd 는 `workspace/` **루트**(특정 repo 아님)라 에이전트 세션 쓰기는 안 막히고 **소스 편집만** 막힘 → cwd 변경 불필요.
- claude 는 cwd 가 메인 앱(c:\ecams-ai)이라 workspace ACL 밖 → 추가로 `--disallowedTools Edit Write MultiEdit NotebookEdit` 로 쓰기 도구 자체 차단(메인 앱 소스도 보호).

**"수정본"은?** 원본은 안 건드리되, 답변의 diff + "💾 수정본 다운로드" 버튼(`/api/fs/apply-diff`)이 **메모리에서 적용해 다운로드**로 내려줌(디스크 미반영). 사용자의 "temp 에 수정본" 요구는 이 다운로드로 충족.

## 검증 (실측)

- icacls deny. 기존 파일 append/신규 생성 모두 "Access is denied", 읽기 OK, 21ms. (PowerShell/Bash 실측)
- 게이트 테스트(node-pty 로 서버와 동일하게 agy 실행, 소스 deny + cwd=scratch). agy 가 매직넘버 정상 read, out.txt 생성은 "Access is denied" 실패, agy 정상 종료(exit 0). → **읽기 동작·쓰기 차단 동시 확인**.
- ACL 헬퍼 단위테스트. deny→차단, refcount 2 동시처리, 부분 allow 시 유지, 완전 allow 시 복원, 읽기 항상 OK.
- `node --check server.js` 통과.

## 후속 버그 수정 (2026-06-05 12:47)

### CMD 창 깜박임
`execFileSync('icacls', ...)` 호출 3곳에 **`windowsHide: true`** 누락 → 매 요청마다 deny/allow 에서 cmd 창이 repo 수 × 2 회 깜박임. 서버 시작 시 `resetLeftoverDenies` 에서도 모든 repo 에 대해 깜박임 발생.
- **수정**: 3곳 모두 `{ stdio: 'ignore', windowsHide: true }` 로 변경. `node --check server.js` 통과.

### 알림 지연 가능성
`execFileSync` 는 동기 호출이라 이벤트 루프를 블로킹 → SSE 스트림 전송·push 알림 전송이 지연될 수 있음. `icacls` 자체는 ~20ms 이므로 체감 영향은 낮지만, 동시 요청이 몰리면 누적 지연 발생 가능. 심하면 `execFile` (비동기) 로 전환 고려.

## 미검증 / 주의

- **서버 재시작 필요** — 위 변경 반영.
- claude `--disallowedTools` 로 실제 분석 답변이 정상 완료되는지 실 질의 1건 확인 권장(읽기 기반이라 영향 낮음).
- claude 의 Bash 도구를 통한 우회 쓰기는 ACL(workspace)로 막히고, 메인 앱 대상은 미차단(프롬프트가 메인 앱을 가리키지 않아 실위험 낮음).
- 이미 LLM 이 고쳐버린 광주은행 파일(RequestStatus.js/.jsp, Cmd3100.java, PrgListReport.js)은 **사용자가 원본 소스로 직접 되돌리기로 함**(git 없음).
