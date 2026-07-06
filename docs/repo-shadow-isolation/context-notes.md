# Context Notes - AGY 그림자 격리

## 결정 사항 및 근거

- **왜 격리(copy)인가 — 예방·복원이 둘 다 불가/불완전.**
  - 예방: AGY엔 도구 차단 플래그 없음(`--help` 실측). `--sandbox`·skip-permissions 제거 모두 파일 수정 못 막음(probe 2회 실측, ORIGINAL→EDITED).
  - 복원: snapshot-restore는 modify-then-revert라 실행 중 원본이 디스크에서 수정됨(사용자 실목격, 실행 후에도 잔존=복원 실패). 구멍 3개(untracked 미삭제 / 기존 dirty 미복원 / checkout 실패 삼킴).
  - 결론: AGY가 원본을 못 보게 하는 격리만이 근본 해결.

- **왜 robocopy /MIR (full copy-on-run 대신).**
  - /MIR은 델타 동기화 → 최초 1회만 전체 복사, 이후 ~1~2초. full copy는 매번 5,700파일(광주은행 ~200MB) 전체 → 수~십수 초.
  - /MIR이 미러라 직전 AGY 수정 자동 원복 + 신규파일 purge → restore 대체.
  - 측정치. kjbank_html5 170MB/4760파일, kjbank_server 32MB/969파일, 전체 workspace 1.1GB/41098파일.
  - per-request 오버헤드(~1~2초)는 AGY 실행(45~210초) 대비 무시.

- **wiki/indexes는 은행명으로 분류** (광주은행/, 토스/...). 선택 repo의 은행분만 미러하면 충분.

- **withRepoLock 유지.** 그림자는 영구·공유라 같은 repo 동시 요청이 /MIR로 서로의 그림자를 리셋할 수 있음 → 기존 락으로 직렬화. 다른 은행은 병렬 유지. (full copy-per-unique-dir이면 락 불필요하나 속도 손해라 선택 안 함.)

## 특이 사항 / 주의

- **robocopy 종료코드.** 0~7은 성공(1=복사됨, 2=extra삭제, 3=둘다...), 8 이상만 실제 에러. `execFileSync`는 비0이면 throw하므로 종료코드를 직접 판정해야 함.
- **한글 경로.** robocopy는 한글 정상 처리. 단 server.js 호출 시 인코딩 주의.
- **롱패스.** 레거시 Java/JS repo라 node_modules 깊은 중첩은 없을 듯하나, >260자 경로 발생 시 robocopy `/256` 또는 `\\?\` 고려.
- **최초 동기화 지연.** 첫 질문 시 전체 미러(~수초~십수초) 발생. 이후 캐시. UX 안내 필요시 status 메시지.

## 구현 중 바뀐 결정

- **snapshot-restore 제거 → 유지로 변경.** plan은 AGY 분기에서 제거하자 했으나, AGY가 그림자만 보므로 원본 newlyModified=0 → restore는 no-op. 남겨두면 ① Gemini 등 다른 모델 보호 유지 ② 만에 하나 프롬프트가 절대 원본경로를 흘려 AGY가 원본을 건드려도 잡는 안전망(belt-and-suspenders). 더 surgical하기도 함(runChatJob 무수정). → `runAgyStream`의 경로해석만 그림자로 바꾸는 최소 변경.
- **sync+resolve 통합.** plan은 syncShadows/resolveShadowPaths 둘로 나눴으나 은행계산 중복이라 `prepareShadows` 하나로 합침. `runAgyStream`이 이미 `withRepoLock` 안에서 호출되므로 미러도 락 안에서 일어남.
- **robomirror는 async(execFile).** execFileSync면 수초 미러가 이벤트루프를 블록 → 동시 사용자 영향. execFile + await로 논블록.

## 검증 실측 (2026-06-24)

- robocopy /MIR 절대경로: 그림자 변조(HACKED+litter) → 재미러 시 ORIG 원복 + litter purge + 원본 불변. 종료코드 1·3(둘 다 성공, <8).
- **격리 E2E**: 실제 agy.exe를 `--add-dir <그림자 kjbank_server>`로 실행, 그림자 절대경로 .project Edit 지시 → agy exit 0, 그림자 .project에 마커 추가됨, **원본 .project 해시 불변·마커 없음**. AGY가 원본을 접촉하지 않음을 실 바이너리로 확인.
- 누출경로: repo-map `s.file`은 `path.relative(repoPath, ...)` 상대경로(repoMapBuilder:421,426). wiki(2317파일)·screen_maps 절대경로 0개. **그러나 indexes/*.md 헤더("경로: C:/ecams-ai/workspace/...")에 절대 원본경로 존재** → AGY 가 그림자 index 를 읽어도 그 텍스트가 원본을 가리켜 누출 가능(advisor 지적, 사용자 재발 패턴과 일치). → `neutralizeShadowPaths` 로 그림자 wiki/indexes 내용의 절대 원본경로를 `.shadow/workspace` 로 치환해 차단. 패턴 포함 파일만 덮어써 /MIR 델타 유지(wiki 0개 매칭 → 재복사 없음, index 소수만 churn). 실측: 치환 후 그림자 index 누출패턴 `ecams-ai/workspace` 0개.
- 미러 속도: kjbank_server 32MB/969파일 첫 동기화 ~0.4s.
- 테스트 하니스 주의: agy.exe는 pty 필요(server는 node-pty). PowerShell Start-Process(파이프)로는 hang/timeout. Git Bash `timeout`은 동작. print-timeout은 실 repo add-dir 스캔 때문에 짧으면(70~90s) 부족 → 서버처럼 넉넉히.

## 서버 E2E 1차 — 회귀 발견·수정 (2026-06-24)

사용자가 재시작 후 실제 질문("에이전트모니터링 엑셀저장 파일명 수정")을 던지니 AGY가 `cleanLen=117` "I am waiting for the file search to complete..." 만 내고 35s 종료(이전 동질문 answerLen=2689). 격리 자체는 정상(`cwd=.shadow\workspace`, 그림자 4760파일=원본 동일, robocopy 에러 0).

**원인.** 시스템 프롬프트가 AGY 에게 `wiki/[repo_id]/Main.md`, `indexes/[repo_id]_index.md`(server.js:1013,1323-1330) 를 읽으라 지시 → AGY 는 **`wiki`/`indexes` 라는 basename 의 add-dir 루트**에서 Glob 으로 찾는다. 기존 add-dir 은 `C:\ecams-ai\wiki`(basename=`wiki`). 그런데 1차 구현이 add-dir 을 `.shadow\wiki\광주은행`(basename=`광주은행`)으로 바꿔 **`wiki` 루트가 사라짐** → AGY 파일탐색 실패. (실제 wiki 구조는 `wiki/<은행>/<repo_id>/...`, 프롬프트의 `wiki/[repo_id]`는 근사치라 AGY 가 Glob 으로 해소.)

**수정.** wiki/indexes 내용은 선택 은행만 미러하되, includeDirs 에는 **`.shadow\wiki`·`.shadow\indexes` 루트**(basename 보존)를 push. 결과 includeDirs 구조가 원본과 동일(.shadow 프리픽스만 차이): `[그림자 repo들, .shadow/wiki, .shadow/indexes]`. → 재시작 후 재검증 필요.

**교훈.** add-dir 의 basename 이 프롬프트 경로 해석의 일부다. 그림자는 **경로 구조를 그대로 보존**해야 하고, 위치 prefix 만 바꿔야 한다(스코핑으로 구조를 바꾸면 깨짐).

## 서버 E2E 2차 — "waiting for search" 는 그림자 탓 아님 (충실 A/B, 2026-06-24)

wiki basename 수정 후에도 실서버에서 수정질문이 `cleanLen=112` "I am waiting for the background search to complete..." 로 실패. 그림자가 원인인지 가리려고 **node-pty 충실 하니스**(server runAgyOnce 와 동일 spawn)로 동일 프롬프트를 real vs shadow 로 돌림.

결과(동일 프롬프트, 동일 방식).
| | EXIT | elapsed | cleanLen | 출력 |
|---|---|---|---|---|
| REAL | 0 | 244.2s | 88 | "Error: timed out waiting for response" |
| SHADOW | 0 | 248.2s | 86 | "Error: timed out waiting for response" |

**real 과 shadow 가 완전히 동일하게 실패.** 둘 다 4분 타임아웃, 답변 없음, 파일 미수정. → **그림자는 AGY 행동의 차이를 만들지 않는다.** "waiting for search" 류 엉터리 답은 AGY 가 **수정질문**에서 내는 고질적 불안정성이고(분석질문은 정상 동작), 그림자와 무관.

해석. 과거 성공 실행은 전부 분석질문. 수정질문에서 AGY 의 "deliverable" 은 사실상 **파일 편집**이었고(원래 불만 = AGY 가 원본을 고침), 텍스트 답은 원래부터 빈약. 그림자가 그 편집을 무효화하니 빈약한 텍스트만 남아 사용자 눈에 띈 것. 그림자 격리는 의도대로 동작(원본 보호 실증). 프로젝트 기존 결론과도 일치(agy-workspace-protection 노트의 AGY 비결정성, repo-map-poc 의 Haiku/Sonnet 권고).

권고. 수정질문은 더 안정적인 모델(Haiku/Sonnet, claude CLI — 이미 지원)로 라우팅, AGY 는 분석 전용. (그림자는 어느 모델이든 원본 보호로 유지.)

주의(미해결). 충실 하니스는 server 와 다른(간소) 프롬프트라 절대 실패양상이 다름(4분 타임아웃 vs server 의 35~45s 즉시 bail). 그러나 **real vs shadow 동일조건 비교는 유효**하며 차이 없음. server 의 정확한 프롬프트로 real 비교는 server 자체로만 가능.

## ⚠️ 중대 한계 — AGY 셸 도구가 그림자를 우회 (2026-06-24 발견)

그림자는 AGY 의 **add-dir 범위 도구(Read/Edit/Grep)** 만 가둔다. AGY 의 **Bash/셸 도구(`Get-ChildItem` 등)는 cwd/add-dir 와 무관하게 전체 파일시스템에 접근**한다. 실증.

- AGY 가 자체 생성한 docs/context-notes 에 "`Get-ChildItem` 으로 hnbank_cn_html(하나은행중국법인) repo 에서 AgentMornitoring.js 확인"이라 기록 — hnbank_cn 은 **어떤 add-dir 에도 없는** repo. 즉 AGY 가 광역 셸 검색으로 add-dir 밖 원본까지 찾음.
- standalone 테스트(test_retry, server 의 restore net 없음)에서 **원본 AgentMornitoring.js 가 실제로 수정됨**(`exportExcel('에이전트서버리스트.xls')`→`'agent모니터링.xls'`). 그림자 cwd 로 돌려도 셸로 원본을 고침.

함의.
- 실서버(runChatJob)엔 snapshot-restore net 이 남아 있어 셸로 수정된 **추적 파일**은 되돌린다(그래서 유지한 게 정답이었음). 그러나 untracked litter(셸로 만든 docs 등)·restore 의 3구멍은 여전.
- 즉 **그림자만으로 완전 격리 아님**. 그림자(add-dir 도구) + restore net(추적파일) 조합이 현재 방어선.

다음 세션 최우선 과제.
1. AGY `--sandbox`("terminal restrictions")가 셸의 파일시스템 접근을 제한하는지 probe(이전엔 Edit 차단만 확인, 셸 미검증). 막으면 거의 무료로 셸 구멍 차단.
2. 안 되면 — 제한 OS 계정/컨테이너에서 AGY 실행(원본 경로 자체 미노출), 또는 restore net 을 untracked 정리까지 확장(run 중 생성 untracked 삭제, 단 run-created 만 — 신중히).
3. 실서버에서 셸 수정질문 → 원본 미수정 재확인(standalone 아닌 runChatJob 경로).

## 후속 과제 (이번 범위 밖)

- **Gemini 경로 동일 위험.** `runGeminiStream`도 `resolveGeminiPaths`로 실제 경로를 받아 쓰기 가능. 이번엔 AGY만 격리(사용자 관심사). Gemini 활성 사용 시 동일 적용 필요.
- **기존 잔재 정리.** workspace의 `광주은행/kjbank_server/docs/tar-file-error-analysis/`(AGY litter), `kjbank_html5/src/DBInfo.properties_back`(2026-05-11자) — 사용자 확인 후 제거.
- **커밋된 docs/apply-request-sr/.** gitRoot에 별도 Claude Code 세션이 커밋(6790ec49). ecams-ai 동작과 무관. 되돌릴지 사용자 결정 대기.
