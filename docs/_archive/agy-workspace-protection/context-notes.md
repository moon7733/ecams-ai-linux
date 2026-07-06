<!-- agy(Antigravity) 모델이 workspace 원본을 직접 수정하는 보호 우회 문제의 조사 기록과 다음 단계 -->
# agy workspace 쓰기 보호 우회 — 조사 기록 (2026-06-11)

## 한 줄 요약

수정질문("~해줘")을 **agy 모델**로 던지면, 분석 답변만 내야 하는데 agy 가 **실제 workspace 원본 파일을 직접 수정**한다. `denyWorkspaceWrites` ACL 보호가 agy 에게는 안 먹힌다. 원인은 **소유자 권한(owner rights)으로 ACL 리셋 후 쓰기**. 근본 수정은 미완료 — 다음 단계는 "분석 후 변경 되돌리기(스냅샷·복원)" 설계(아래 D 참조).

---

## 배경 / 보호 구조

- `/api/chat` → `runChatJob` → 모델 실행 전 `denyWorkspaceWrites(repoRootsFor(allowedRepos))` 로 대상 repo 루트에 쓰기 거부 ACL(icacls /deny)을 걸고, `finally` 에서 `allowWorkspaceWrites` 로 제거한다. (server.js)
- claude 경로(`runClaudeCodeStream`)는 `--disallowedTools Edit,Write,MultiEdit,NotebookEdit` 로도 막힌다. **agy 경로(`runAgyStream`)는 도구 차단 플래그가 없어 ACL 만이 유일한 방어선**이다. (server.js:743 주석 참조)

## 재현 사실 (로그 증거)

질문. "운영배포화면에 지금은 sr에엮인 모든 프로그램 한번에 신청해야되는데 한번에 신청안해도 되게 수정해줘" (광주은행 repo 6개 선택, model=agy).

대상 파일. `workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js` 의 `cmdReqClick()` 내 `substr(19,1)`/`substr(26,1)` 검증 블록.

1. ApplyRequest.js mtime 가 agy 실행 구간(START~EXIT) 한복판이고, working-tree diff 가 agy 가 답변에 제시한 diff 와 정확히 일치 → **agy 가 파일을 직접 씀**. (분석 답변은 파일을 안 써야 한다는 전제가 깨짐)
2. ACL 로그(logs/acl_debug.log)상 deny 는 **정상 적용**됨 (`icacls 1개 처리/0 실패`), 그 구간에 파일이 수정됨.
3. 격리 테스트(node execFileSync, 서버와 동일): in-process write·node-pty 자식·삭제후재생성·rename·copyFile **전부 EPERM 차단**. 즉 쓰기 방식 문제 아님.
4. node 프로세스 소유자 모두 `AZSOFT`(비SYSTEM, start.bat 더블클릭=비elevated). 서버는 pm2(`npx pm2 start server.js`)로 AZSOFT 권한 실행.

## 진짜 원인 (실증 완료)

**소유자 권한(owner rights) 우회.** 파일 소유자가 AZSOFT 라, deny ACE 가 write-data 를 막아도 소유자는 **WRITE_DAC(권한 변경)** 를 암묵적으로 갖는다. agy.exe 는 쓰기 실패 시 **자체적으로 파일 ACL 을 리셋(icacls /grant 상당)한 뒤 쓴다**.

실증(probe5).
- `user-deny(WD,AD,WA)` 만: 직접 쓰기는 EPERM 차단, 그러나 소유자가 `/grant` 로 ACL 리셋 가능 → 리셋 후 쓰기 성공(우회).
- `user-deny + OWNER RIGHTS(*S-1-3-4) deny(...,WDAC,WO,DE,DC)` 추가: 소유자의 ACL 변경까지 차단 → 우회 실패.

## ⚠️ OWNER RIGHTS deny 는 드롭인 수정이 아님 (중요)

OWNER RIGHTS deny 를 `denyWorkspaceWrites` 에 그냥 넣으면 안 된다. **서버도 AZSOFT(소유자)** 라 분석 후 `allowWorkspaceWrites` 로 deny 를 제거할 때 동일하게 WDAC 가 막혀, **서버가 스스로 못 풀고 repo 를 영구 잠근다**. (조사 중 실제로 kjbank_html5 가 잠겼고 SYSTEM 권한으로만 풀 수 있었다. 복구는 `scratch/fix_acl.ps1` 참조.)

## 다음 단계 — 권장 설계

- **(A) 분석 후 변경 되돌리기 (권장).** agy 실행 직전 대상 repo 의 변경 가능 파일 상태(경로+해시 또는 mtime)를 스냅샷 → 실행 후 변경/생성된 파일을 감지해 원복(원본 복원 + agy 가 새로 만든 파일 삭제). agy 를 못 막아도 결과적으로 원본 보존. git 워킹트리면 `git checkout`/`git clean` 으로 간단. ACL 의 잠금 위험도 없음.
- (B) agy 를 비소유자 제한 계정으로 실행 — 무겁고 설정 복잡.
- (C) OWNER RIGHTS deny + 서버 cleanup 을 SYSTEM 작업으로 — 복잡·취약, 비권장.

스냅샷 대상은 `repoRootsFor(allowedRepos)`. agy 가 만든 부산물 예: `docs/allow-partial-deploy/`(plan/checklist/context-notes 를 AGENTS.md 규칙대로 workspace 안에 생성), 본문 파일 수정.

---

## LLM 답변 품질이 질문마다 들쭉날쭉한 건 (사용자 관찰)

**동일 질문 + 동일 모델(agy)인데 결과가 매번 크게 다름.** 비결정성 + agy 신뢰도 문제. 증거(logs/agy_debug.log).

| 실행 | 소요 | cleanLen | 결과 |
|---|---|---|---|
| 1차 | >300s | (무답) | **타임아웃** — `--print-timeout 5m` 초과로 중단, 답변 못 받음 |
| 2차 | 152.2s | 7311 | 답변 옴, 그러나 **엉터리** — 검증 블록 통째 주석 처리해 `chk_SrItem`(SR 정합성 검사)까지 제거, 두 분기 비대칭(한쪽만 realApply 추가) |
| 3차 | 129.5s | 4288 | **괜찮음** — 정확히 필요한 부분만 주석 |

기여 요인 추정.
- agy 컨텍스트가 과도하게 넓음. `cwd=C:\ecams-ai\workspace`, `--add-dir` **9개**(은행 repo 전체 + sample_db). 초점 흐려짐 + 느려짐(타임아웃 유발).
- agy(Antigravity flash)는 정밀 수술적 코드 편집에 약함. repo-map-poc 결론(결정 62~68)은 Haiku 기본 + Sonnet 정밀 옵션 권장이고 agy 는 실험 단계였음.
- wiki/Graph 인덱스 의존(답변 섹션 0 참조) — 인덱스가 stale 하면 이미 반영된 변경을 다시 제안하는 등 빗나감.

개선 방향(미적용, 검토용).
- 수정질문은 컨텍스트를 **선택 repo 로만** 좁히기(현재 cwd=workspace 루트 + add-dir 9개는 과함).
- agy `--print-timeout` 상향(5m→8~10m) 또는 무거운/수정 질문은 Sonnet 으로 라우팅.
- 타임아웃 시 클라이언트에 명확한 안내(현재 `⚠️ Antigravity 오류: agy exit code N` 만 표시).

---

## 세션별 진행사항

### 세션 1 (2026-06-11)

한 것.
- 원인 추적용 로깅 추가(server.js). `logs/agy_debug.log`(START/FIRST_OUTPUT/EXIT ttfb·cleanLen·tail), `logs/acl_debug.log`(deny/allow 적용·실패·refcount). **원인 확정 후 제거 예정** — 임시 진단 코드.
- ApplyRequest.js 를 HEAD 로 원복.
- 복구 스크립트 `scratch/fix_acl.ps1` (잠긴 repo 해제 + 잔재 정리).

### 세션 2 (2026-06-18)

**설계 (A) 구현 완료**: Snapshot-Restore 방식으로 workspace 보호 재구현.

한 것.
1. 최초 커밋과 다른 workspace 파일 확인.
   - 최근 변경: ApplyRequest.js (최초 커밋에 없는 파일, 2628줄 추가), docs/allow-partial-deploy/ (AGY 자동 생성)
   - 컴파일 부산물: Cmm1600.class (리셋 완료)

2. **Snapshot-Restore 구현** (server.js):
   - `snapshotModifiedFiles(repos)`: 에이전트 실행 전 `git diff --name-only` 로 수정된 파일 목록 캡처
   - `restoreModifiedFiles(repos, beforeSnapshot)`: 에이전트 실행 후 신규 수정 파일만 `git checkout --` 로 복원
   - runChatJob의 denyWorkspaceWrites/allowWorkspaceWrites 제거 → snapshot-restore로 변경

3. 동작 원리:
   - 수정된 파일: `git checkout`으로 자동 복원 (원본 보호 ✓)
   - 신규 파일: git의 untracked 상태 유지 (신규 생성 결과물 보존 ✓)
   - AGY가 AGENTS.md 규칙으로 workspace 내에 생성한 docs/plan/checklist/context-notes는 그대로 유지됨

4. ACL 방식의 한계 해결:
   - 이전: OWNER RIGHTS deny로 소유자 우회 차단 → 서버가 복구 시 deny 제거 못 함 (repo 영구 잠금)
   - 현재: 우회 차단 불필요. 애초에 수정본을 인정하고 복원하는 방식 → 소유자 권한 관계없음

### 세션 3 (2026-06-18) — 세션 2 복원이 no-op 이었음을 발견·수정

**중대 발견**: 세션 2의 snapshot-restore 는 경로 버그로 **복원이 실제로 안 됐다(no-op)**. AGY 수정이 그대로 남아 있었음. 사용자가 "수정 안 되는 것 같다"고 한 게 사실은 복원 실패였음.

근본 원인 (실측 확인).
- workspace 는 별도 git repo 가 아니라 **gitRoot(c:\ecams-ai) 의 하위 폴더**. (`git -C <repoSubdir> rev-parse --show-toplevel` → `C:/ecams-ai`)
- `git diff --name-only` 는 **gitRoot 기준 경로**를 출력 (`workspace/광주은행/kjbank_html5/...`).
- 세션 2 코드는 `path.join(root, file)` (root=per-repo 서브디렉토리) → 경로 중복 → `git checkout` 대상이 존재하지 않음 → catch 가 삼킴 → 복원 안 됨.
- 추가로 `git diff` 가 **전체 repo 변경**을 보고 (cwd 무관) → companies.json/users.json 등 서버 데이터까지 복원 대상에 들어갈 위험.
- 한글 경로가 octal escape(`"workspace/\352\264..."`)로 깨짐.

수정 (server.js, gitDiffNamesForRepos 헬퍼로 통일).
- cwd=gitRoot + `pathspec(-- repoRoot)` 로 해당 repo 변경만 scope → 서버 데이터 보호.
- `core.quotepath=false` 로 한글 경로 정상화.
- `path.join`/`path.relative` 제거 (경로가 이미 gitRoot 기준) → checkout 도 gitRoot 에서 그대로.

검증 (PowerShell 전체 시나리오, 실측).
- before 0개 → ApplyRequest.js 수정 모사 → newlyModified 정확히 1개(한글 정상) → checkout → 최종 `git status` 깨끗.
- companies.json(modified 상태)은 before/after 에 **안 잡힘** → pathspec scope 가 서버 데이터 보호함을 확인.

**세션 3 후반 — AGY 사전분류 + 셀렉트박스 제거 구현 완료 (커밋됨)**

구현.
- 셀렉트박스 제거 → 질문 무조건 AGY (model='agy' 고정, index.html).
- `runAgyClassify(message, types)` (server.js): add-dir 없이(scratch 만) 질문만 라벨링. fail-open(파싱실패/불확실/다중/매칭없음 → broad).
- `POST /api/chat/classify`: 코드 타입(web/server/plugin) 2개 이상일 때만 분류, 1개 이하는 single. snapshot-restore 로 감쌈(AGY 비결정성 대비).
- 프론트 sendMessage: 코드 타입 2개↑ + 텍스트 질문이면 분류 → broad/단일타입(repo여러개=플러그인) → 팝업, 단일타입(repo1개) → 자동 좁힘.
- dead code 제거: ACL 계열(denyWorkspaceWrites/allowWorkspaceWrites/logAcl/_denyRefcount), 프론트(SONNET_KEYWORDS/checkSonnetRecommend/updateModelLabels), 잘못된 checkShouldFilter.

실증 (scratch 임시 스크립트, 삭제됨).
- 사전분류: ~16s, 파일 미수정, JSON 출력. 변별력 확인("운영배포+SR"→broad, "그리드 컬럼 정렬"→web).
- **Node execFileSync git checkout 으로 한글 경로 파일 복원 성공** (PowerShell 아닌 실제 코드 경로 — advisor 블로킹 지적 해소).

**동시성 해결 (사용자: 여러 명 동시 사용 필수)** — `withRepoLock(repos, fn)` 추가.
- 같은 repo 를 건드리는 작업 직렬화, 다른 고객사 repo 는 병렬 유지. roots 정렬로 deadlock 회피, finally 에서 lock 정리.
- runChatJob 의 snapshot~restore 구간 + classify 엔드포인트에 적용 (분류 restore 가 동시 chat 변경 되돌리는 것도 방지).
- 검증(로직 복제): 같은 repo 직렬 ✓, 다른 repo 병렬 ✓, 겹치는 집합 직렬 ✓, lock 누수 0 ✓.

**LLM 사전분류 철회 (속도 미달) → 즉시 팝업 방식으로 전환**
- 분류 속도 실측: AGY ~16s, claude haiku CLI ~5.8s. 목표 1~2s 는 API 직접 호출만 가능한데 API 키 도입 계획 없음 → LLM 분류 폐기.
- 서버 `/api/chat/classify`·`runAgyClassify` 제거. 프론트 `classifyScope` 제거.
- 대체: 프론트 sendMessage 에서 코드 타입(web/server/plugin) 2개 이상이면 **LLM 호출 없이 0초에 즉시 범위선택 팝업**. 사용자가 직접 타입/플러그인/DB 선택 → 해당 repo 만으로 진행.
- withRepoLock 은 runChatJob 동시성용으로 유지.
- 팝업 UI 깨짐 수정: 타입 컨테이너 grid 2열 → flex 1열, 체크박스 flex-shrink:0+크기고정, 텍스트 white-space:nowrap (데스크탑·모바일 공통).

미검증 / 다음 세션 TODO.
1. **통합 E2E (서버 재시작 필요)**: UI 에서 ① 여러 타입 선택 → 즉시 팝업(0초) + UI 안 깨짐 ② 팝업에서 타입 선택 → 해당 repo 만으로 AGY ③ AGY 수정질문 후 workspace 파일 복원 — 3가지 확인.
3. 이미지: AGY CLI 직접 첨부 여전히 미지원 전제(결정 19). 최신 CLI 지원은 probe 재실행해야 확정. 현재 Sonnet 묘사 → AGY 2-stage 유지([server.js] 2357~).
4. 임시 진단 `logAgy`/`agy_debug.log` 정리 여부 (AGY 성능 추적 가치 있어 일단 유지). `logAcl`/`acl_debug.log` 는 함수 제거됨(더 안 쌓임).
5. 타임아웃/라우팅: dirs 많을수록 느림(dirs9 ~87s, dirs5 ~61s, 실측). 사전분류로 범위 좁히면 자연 개선. AGY ttfb 0.1s 로 프로세스 자체는 가벼움 — 느림은 컨텍스트 내 도구 호출 때문.
