# Plan - AGY 그림자(shadow) 격리로 원본 보호

## 배경 / 문제

AGY(`agy.exe`)는 분석 질문에도 **실제 workspace 원본 파일을 직접 수정**한다. 검증 결과.

- AGY엔 `--disallowedTools` 같은 **도구 차단 플래그가 없다** (`agy --help` 실측).
- `--sandbox`는 셸 제한이지 파일 쓰기 보호가 아니다 (probe: ORIGINAL→EDITED 수정됨).
- `--dangerously-skip-permissions` 빼고 print 모드로 돌려도 도구를 그냥 실행한다 (probe: 역시 수정됨).
- 즉 **AGY에게 "파일 쓰지 마"를 시킬 네이티브 수단이 없다.**

기존 방어선인 snapshot-restore("실제 파일 수정 → 끝나고 `git checkout` 복원")는 본질적으로.
- 실행 중 수십 초~수 분간 **진짜 파일이 디스크에서 수정된 상태**로 존재 (사용자가 AgentMornitoring.js에서 실제 목격, 실행 후에도 남아 있었음 = 복원 실패).
- 복원 자체에 구멍 3개. ① 신규 untracked 파일 안 지움 ② 스냅샷 시점에 이미 dirty면 영영 복원 안 됨 ③ `git checkout` 실패를 `stdio:'ignore'`로 삼킴.

구멍을 막아도 "실행 중 원본이 수정된다"는 근본 문제는 안 사라진다.

## 해법 — AGY가 원본을 아예 못 보게 한다 (copy-on-run, robocopy /MIR)

매 AGY 실행 직전, 선택된 repo를 **그림자 디렉터리로 미러**하고 AGY의 cwd·`--add-dir`를 전부 그림자로 돌린다. 원본은 AGY가 열지조차 않으니 수정될 수 없다.

`robocopy /MIR`을 쓰는 이유.
- source→shadow 미러라 **이전 실행에서 AGY가 그림자에 한 수정은 원본으로 덮여 자동 원복**되고, AGY가 만든 신규 파일은 **purge**된다. → 이 한 단계가 restore 기계 전체를 대체.
- 델타 동기화라 최초 1회만 전체 복사, 이후엔 바뀐 파일만 → per-request ~1~2초 (AGY 실행 자체가 45~210초라 체감 무시).

## 그림자 구조

- 그림자 루트. `c:\ecams-ai\.shadow\` (gitignore).
- repo 소스. `.shadow\workspace\<은행>\<repo>` ← `workspace\<은행>\<repo>` 미러.
- 참조 데이터. wiki/indexes는 **은행명**으로 분류됨 → 선택 repo의 은행만 `.shadow\wiki\<은행>`, `.shadow\indexes\<은행>`로 미러 (전체 미러 불필요).

## 변경 대상 (server.js)

1. `SHADOW_ROOT` 상수 + `syncShadows(repos)` 추가.
   - 각 repo 실제 경로 → 그림자 경로로 `robocopy /MIR /MT /NFL /NDL /NJH /NJS /NP`.
   - 선택 repo의 은행 추출 → 해당 은행 wiki/indexes도 /MIR.
   - robocopy 종료코드 0~7은 성공(8+만 에러)임에 주의.
2. AGY 전용 경로 해석 `resolveShadowPaths(repos)` — cwd=그림자 workspace 베이스, includeDirs=[그림자 repo들, 그림자 wiki/<은행>, 그림자 indexes/<은행>].
   - 기존 `resolveGeminiPaths`는 Gemini용으로 유지 (Gemini 동일 위험은 context-notes에 후속 과제로 기록).
3. `runAgyStream`/`runAgyOnce`가 그림자 경로를 쓰도록 연결.
4. `runChatJob`의 AGY 분기에서 snapshot-restore 제거. `withRepoLock`은 **유지** (공유 그림자를 같은 repo 동시 요청이 /MIR로 서로 리셋하는 것 방지).
5. `.gitignore`에 `.shadow/` 추가.

## 성공 기준 (verify)

- [V1] AGY 수정질문 1건 실행 → 실행 **중**에도 실제 workspace 파일 mtime/내용 불변, 실행 **후** `git status` 깨끗.
- [V2] AGY가 그림자에 수정/신규파일 생성 → 다음 /MIR이 원복·purge (그림자가 pristine으로 리셋).
- [V3] 분석 정상 — AGY가 그림자에서 Read/Grep으로 코드를 읽고 답변 생성.
- [V4] 같은 repo 동시 2건 → withRepoLock으로 직렬, 서로 간섭 없음. 다른 은행은 병렬.
