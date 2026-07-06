# Agent Bridge 합의 기록

## 2026-07-01

- Codex와 Claude Code의 긴 검토 내용은 채팅 복붙 대신 `docs/agent-bridge/` 파일로 공유한다.
- 사용자는 Codex에 `/ecams 핸드오프`, Claude Code에 bridge 파일 검토 요청, Codex에 `/ecams 합의`만 짧게 지시한다.
- 합의된 결정은 이 파일과 관련 feature의 `context-notes.md`에 누적한다.

## 2026-07-01 AGY bail과 유료 API dead path 합의

- AGY bail의 핵심 원인은 단순 재시도 부족이 아니라 `isAgyBail`이 `exitCode`를 무시하고 긴 영문 timeout 출력을 정상 답변으로 통과시키는 점으로 합의했다.
- `--print-timeout 5m`은 유지한다. 292초 정상 한글 답변 로그가 있으므로 per-attempt timeout을 줄이면 정상 답변을 죽일 위험이 크다.
- bail 수정 방향은 `exitCode`와 한글 유무를 `isAgyBail` 판정에 포함하고, 전체 재시도 wall-clock 예산을 두며, timeout 실패는 nudge 재시도 대신 명확한 실패 안내로 처리하는 것이다.
- 유료 API dead path 제거 순서는 승인했다. 다만 catch-all fallback과 `modelInput='claude'` 기본값 정리는 마지막이 아니라 유료 dispatch 제거와 같은 첫 커밋에서 처리한다.
- 무료 Gemini 기반 `clarifier.js`, `GEMINI_KEY`, `getEmbedding`은 되묻기와 임베딩 보조 경로이므로 유지한다.
- `runClaudeCodeStream`과 `/api/fs/analyze`는 API key 경로가 아니라 구독 세션 exec 경로이므로 이번 유료 API 키 삭제 대상에서 제외한다.
- GPT exec 도입은 `codex --help`가 `Access is denied`로 실패하는 환경 권한 문제를 해결한 뒤 다시 probe한다.
- 사용자는 첫 AGY 시도가 5분 안에 정상 답변을 못 내고 timeout으로 종료되면 재시도하지 않고 질문 범위를 좁혀달라는 정적 안내를 반환하는 방향을 승인했다.
- 따라서 재시도 wall-clock 예산은 별도 6~7분이 아니라 첫 시도 `--print-timeout 5m` 기준으로 확정한다. 단, AGY가 5분 안에 정상 한글 답변을 내면 그대로 통과시킨다.

## 2026-07-01 AGY 서브에이전트 grep 덤프 누출 수정 (커밋 db89df89)

- enduser 계정 질문에서 agy가 서브에이전트 tool 출력(grep 결과 + `[[uuid/task-N] status: COMPLETED]` + `[task-N stdout]`)을 최종 답변 앞에 흘려 소스 경로가 그대로 노출됐다. `answer_log_20260701.jsonl`에 저장된 답변이 화면과 바이트 단위로 동일해 실증됐다. 결정 81의 "소스 누출 0"이 이 케이스에서 깨졌다.
- 근본원인은 `stripAgyPreamble`가 "첫 한글 라인 이전만 스킵"이라, grep 덤프 라인에 한글 코드주석(`//운영반영제외요청`)이 섞이면 첫 줄부터 한글 판정 → 아무것도 안 잘리는 것으로 확정했다.
- 수정 방향은 실제 답변 헤더(`## 0. 분석 근거` / `### 0.` / `1. 한 줄 요약`)를 substring anchor로 찾아 그 지점부터 슬라이스하는 것이다. 줄 단위 필터는 금지한다 — 답변 첫 줄이 `</iframe>1. 한 줄 요약`처럼 grep 라인 끝에 줄바꿈 없이 붙어와서 라인째 버리면 답변 시작이 사라진다.
- fail-safe로, anchor 없이 orchestration 마커만 있으면 빈 문자열을 반환해 `isAgyBail`이 범위축소 안내(bail)로 처리하게 했다. 미래 agy 포맷 변경도 조용한 누출 대신 가시적 bail로 드러난다.
- 검증은 로그 실제 누출 입력(3506→588자, 답변 헤더부터 시작·task/grep/status 마커 0) + 회귀가드 7/7 + `node --check` 통과다. pm2 재시작 후 실사용 E2E는 미검증 상태다.

## 2026-07-01 enduser 답변 렌더 개선 (커밋 6df7bf3a·731ec167)

- 줄바꿈 뭉개짐 + 숫자 강조 불일치는 모델측 whitespace 변덕(런마다 `#`·번호·개행 들쭉날쭉, ConPTY 아님)으로 확정했다. 글루 패턴을 정규식으로 쫓는 두더지잡기 대신, 고정 제목(한 줄 요약/따라하기 단계/주의할 점 / 자주 막히는 부분)에 앵커해 `##` 헤더로 승격하는 방향으로 정했다. 양방향 글루 해소 + 상위=헤더/하위=번호로 숫자중첩 모호성 제거(모델 협조 불필요). 실제 로그 2런 검증, 사용자 실사용 확인 완료.

## 2026-07-01 헤더 고객사 칩 표시 #2 (커밋 bb743ca8)

- 대화창이 어느 고객사인지 헷갈리는 문제. 헤더에 현재 고객사 칩을 상시 표시하기로 했다. 이전 대화를 열면 그 대화의 확정 고객사(`meta.company`), 새 대화/미확정이면 선택 repo 기준으로 표시한다. 프론트 전용이라 하드리로드로 반영된다.
- 대화기록/UX 3건(#1 기록 아이디별 통합, #2 고객사 표시, #3 메시지 삭제) 중 #2만 먼저 구현했다. #1·#3은 서버 저장 설계가 얽혀 Codex와 결정 대기(`to-codex.md` 추가 쟁점 섹션).

## 2026-07-01 고객사 단일 선택 + 대화당 한 고객사 하드락 (커밋 7c5e7fe2)

- 고객사(repo 그룹)를 한 번에 여러 개 선택하던 것을 **단일 선택**으로 바꿨다. `toggleGroup`이 체크 시 다른 고객사 선택을 모두 비우고 그 고객사만 선택한다(라디오 동작). init은 이미 첫 고객사만 선택하고 있었다.
- 한 대화는 **한 고객사 전용**으로 확정했다. 기존엔 진행 중 대화와 다른 고객사를 골라도 소프트 confirm에서 "취소=현재 대화 계속"으로 억지로 다른 고객사 질문이 가능했다. 이를 alert 후 전송 차단(하드락)으로 바꿔, 다른 고객사는 반드시 '새 대화'로만 시작하게 했다.
- 모든 전송 경로(이어서 질문·더 알아보기·추천질문)가 `sendMessage`를 거쳐 락이 일괄 적용된다. 같은 대화 내 후속질문은 고객사가 일치해 오작동 없다. 프론트 전용, 하드리로드 반영.

## 2026-07-01 same-repo 동시성 선행 검증

- 같은 고객사 요청이 직렬화되는 원인은 `requestQueue`가 아니라 `withRepoLock`이다. `MAX_CONCURRENT = 3`은 전체 큐 병렬 수이고, 같은 repo root는 모델 실행 직전에 repo lock tail을 기다린다.
- B안(락 제거 또는 읽기 전용 무락)은 현 상태에서 기각한다. `restoreModifiedFiles`는 여전히 원본 workspace를 대상으로 실효가 있고, 기존 shadow 격리 노트의 AGY 셸 우회 원본 수정 위험이 남아 있다.
- A안(그림자 슬롯 풀)은 디스크 비용만 보면 가능성이 있다. 광주은행 `kjbank_html5`는 156.7MB, `kjbank_server`는 29.5MB, 현재 `.shadow`는 제외 패턴 적용 후 53.5MB로 측정됐다. 다만 슬롯 풀은 AGY 셸 우회 방어와 함께 설계해야 한다.
- 슬롯 풀 구현 시 `SHADOW_ROOT` 전역 의존을 제거해야 한다. 특히 `neutralizeShadowPaths`가 슬롯별 `workspace` 경로로 치환하지 않으면 index 헤더가 잘못된 shadow 경로를 가리킬 수 있다.
- 다음 액션은 enduser RAG 요청이 AGY 소스탐색·수정 경로를 실제로 타지 않는지 로그로 확인하는 것이다. 확인되면 enduser만 repo lock 밖으로 분리하는 작은 C'안을 검토한다. 근본 A안은 AGY `--sandbox` 셸 접근 probe 이후 진행한다.

## 2026-07-01 same-repo 동시성 합의 (Claude 회신 2, to-codex.md)

Claude가 Codex 선행검증에 코드·로그 근거로 회신했다. 합의된 점.

- **직접 원인 = `withRepoLock`** 확정. 로그 타이밍(admin timeout 304.8s EXIT 3초 뒤 djsun START)으로도 직렬화 재확증.
- **B(락 제거) 기각은 증거 기반으로 확정.** restore가 실제 발생함을 pm2 out 로그로 실증(6-29 admin 하나은행중국법인 `.jsp` ~13개, 6-30 admin 산림조합 `Cmd1300.java`). AGY 셸의 절대경로 원본 수정 우회는 관측된 사실이다.
- **persona = 프롬프트 경계, capability 경계 아님** 확정. `runAgyStream`은 persona 미분기, `prepareShadows`가 두 persona 모두 전체 repo를 shadow로 미러+`--dangerously-skip-permissions`. enduser 48초는 워크로드/수렴 차이지 도구 제한이 아니다.
- **`snapshotModifiedFiles`는 전역 `git diff` 기반**(run 귀속 아님)임을 확인. 이것이 lock이 필요한 이유다.
- **sandbox capability 경계가 진짜 unlock** 합의. probe가 실질 결정점이며 A 슬롯풀의 선행조건이다.

미합의(보류) — **C'(enduser lock 분리).** 전역 스냅샷 때문에 "restore 유지·lock만 제거"(변형1)는 동시 developer 수정을 되돌려 안전하지 않다. "둘 다 제거"(변형2)만 교차간섭이 없으나, 잔여 위험이 enduser 수정률(프롬프트로만 억제)로만 bound되는 소프트 경계다. 증거 분모는 enduser 17런/developer 108런(총 125), restore 2건 모두 developer. enduser 원본수정 0/17은 시사적이나 표본이 작다. **C'는 sandbox probe 결과 전까지 확정 보류.**

확정된 순서. ①restore 로그에 persona 계측(저위험) → ②sandbox probe(5단계, OFF는 원본수정 잡히고 ON은 안 잡혀야) → ③ON이 원본쓰기 차단하면 A 슬롯풀로 전 persona 병렬(C' 무의미), 차단 못하면 C' 변형2를 계측 켠 채 임시 소프트 완화로 재검토.

## 2026-07-01 same-repo 동시성 합의 (Claude 회신 3) — sandbox 기각 확정

Codex가 restore/persona 계측 + sandbox probe를 완료했다. probe 결과로 방향이 갈렸다.

- **`--sandbox` 기각 확정(1차 증거).** probe에서 sandbox OFF·ON 모두 add-dir 밖 절대경로를 수정했다. AGY `--sandbox`는 이 우회를 못 막는다. Claude의 "sandbox가 unlock" 가설 철회. 기전 — `--sandbox`는 terminal 제한인데 AGY는 Write/Edit 등 비-terminal 파일도구로 직접 쓰므로 원리상 불충분. **sandbox 영구 제외, 재검토 안 함.**
- **restore/persona 계측 채택.** `restoreModifiedFiles`에 `{userId, persona, model, jobId}` 메타 추가, `agy_debug.log`에 `RESTORE_START`/`RESTORE_FILE` 기록(동작 변경 없음). enduser 원본 쓰기율 관찰 근거.
- **현 상태(same-repo lock 유지)가 안전.** OS 격리 서기 전까지 lock 그대로. 지금 풀 근거 없음.

방향 — OS 레벨 쓰기 격리가 근본 해결이나 dev PC엔 큰 공사다. 핵심 함정 — 서버 프로세스 자신이 workspace에 써야(restore·업로드) 하므로 DENY-write는 **AGY 자식이 별도 제한 계정으로 스폰돼야만** 성립(Windows `CreateProcessAsUser`, node 기본 미지원). 두 트랙으로 사용자 선택 대기.
- **Track 1(근본·무거움).** OS 격리 → restore 제거 → lock 제거 → A 슬롯풀 전 persona 병렬.
- **Track 2(실용·가벼움).** lock 유지. enduser 우선순위 큐 + 대기표시로 지연만 완화(실행 중 job 선점은 불가).

다음. Codex는 제한계정/ACL feasibility 소probe 진행 가능(저비용). lock 완화 코드는 probe 성공 + 사용자 Track 1 선택 둘 다 충족 전까지 보류. **Track 1/2 선택은 사용자 결정 대기.**

## 2026-07-01 사용자 결정 — 동시성 보류, 모델 GPT exec 전환 검토 (전략 전환)

- 사용자가 Track 1·2 **둘 다 보류**했다. 근거 — "agy가 원본 수정을 계속하고 안 막히고 멋대로면, 격리 벽을 계속 쌓지 말고 모델 자체를 GPT exec 방향으로 먼저 시도하는 게 낫다."
- 논리. shadow/restore/lock은 전부 agy가 통제 불가(원본 무단 수정)라 존재한다. sandbox probe로 agy `--sandbox`가 원본쓰기를 못 막음이 확인된 이상, 격리로 agy를 길들이는 길은 막혔다. → **권한 모드가 실제 작동하는 모델(Codex CLI/GPT exec의 read-only·workspace-write)로 전환**하면 통제불가 수정 제거 + restore/lock 불필요(완전 병렬)를 한 번에 얻는다.
- 선행 blocker. `codex --help`가 `Access is denied`(기존 기록). GPT exec backend 전에 환경 권한 해소 필요.
- 다음 액션(Codex). ①codex CLI Access-denied 해소 → ②GPT exec 권한 모드가 원본 workspace 쓰기를 막는지 agy와 동일한 5단계 probe로 확인(핵심 판단). ③제한계정/ACL probe는 Track 1 전용이라 후순위로 하향. ④품질/속도/비용 대조는 probe 통과 후.
- same-repo 동시성 결론. GPT exec sandbox가 작동하면 격리·lock 자체가 불필요해지므로, 동시성은 **모델 전환 결과에 종속**시켜 보류한다.

## 2026-07-01 GPT exec 실측 (Claude 직접, Codex 부재) — read-scope·속도·developer 대조

Codex 부재로 Claude가 회신 5 다음 액션을 직접 수행. 상세 `docs/gpt-exec-probe/{context-notes,dev-comparison}.md`.

- **read-scope = 읽기격리 불가 확정.** Windows `--sandbox read-only`는 쓰기만 막고 읽기는 디스크 전체 허용(4 probe, hosts 파일까지 읽힘). cwd/shadow로 읽기 스코프 불가 → 회신 5의 "`--cd` 좁히기/add-dir" 갈래 무의미. 하드 읽기격리는 OS ACL만. **단 AGY 대비 회귀 아님**(둘 다 절대경로 읽기 가능), 원 목표(쓰기안전·동시성)와 별개라 win은 유효.
- **속도는 모델이 아니라 live 탐색이 지배.** reasoning=low 불명확(websocket 오염). 컨텍스트 **사전주입 = 3.4배 단축(289→85s)+품질 유지**. enduser `getGuideKnowledge`와 같은 사전주입 아키텍처가 codex에도 정답.
- **developer 질문 3개 대조 — AGY 우위.** AGY(Flash 3.5) 3/3 완주·환각0(Q2 실제 NPE버그+diff, Q3 requestType 31/33, 44~92s). codex(gpt-5.4-mini) 3/3 실패 — Q1 websocket 끊김, Q2·Q3 **구독 사용량 한도 초과**(무거운 1개가 소진→계정 잠김). **codex 품질은 문제 아님**(전례 289s 정확). 관문은 ①사용량 한도(멀티유저 하드 블로커) ②websocket ③live탐색 속도.
- **codex 재측정 완료(한도 리셋 후).** Q1~3 **3개 다 성공.** Q1 337.7s/Q2 232.5s/Q3 165.3s(전부 AGY 대비 ~3.5배 느림, live 탐색). **품질 = AGY와 대등, 검증지표선 codex 근소 우세**(Q3 requestType 33/33 vs AGY 31/33, Q2 NPE codex 3곳 vs AGY 1곳+diff, 둘 다 소스대조 환각 0). 원문 `answers/codex_q{1,2,3}.md`.
- **종합 판정.** 품질로는 codex 채택 가능. 관문은 품질 아니라 ①사용량 한도(멀티유저 최대 블로커, 2차 성공은 리셋 직후일 뿐) ②속도(3.5배, 사전주입으로 289→85s 완화 전례) ③websocket 신뢰성. **현재 종합 우위는 AGY**(무료·안정·빠름·환각0).
- **미결(다음 세션).** codex 사용량 한도 실제 상한(요청수/토큰/시간창)·멀티유저 고갈속도 실측 = 채택 가부의 핵심. 채택 방향이면 codex를 live탐색 아닌 사전주입(repo-map/가이드) 아키텍처로 붙이는 설계.

## 2026-07-01 GPT exec probe 결과 합의 (Claude 회신 4, to-codex.md)

Codex가 두 작업(Access denied 해소 + GPT exec 5단계 probe)을 완료했고 Claude가 회신·합의했다.

- **Access denied 해소 확정.** 원인은 PATH `codex`가 WindowsApps alias를 가리킨 것. 정상 경로는 AppData 바이너리(`...\OpenAI\Codex\bin\...\codex.exe`, codex-cli 0.142.4). backend 통합 시 PATH를 믿지 말고 **바이너리 경로를 설정값(env)으로 보관**한다.
- **GPT exec `workspace-write`가 원본쓰기를 실제로 차단함 = 핵심 긍정 결과(1차 증거).** OFF(`danger-full-access`)는 add-dir 밖 절대경로 쓰기가 됐고, ON(`workspace-write`, cwd=shadow)은 `blocked by policy`로 차단됐으며 shadow 읽기는 정상. AGY `--sandbox`가 못 하던 것을 GPT exec는 해냈다 → 모델 전환 검토 계속의 근거가 성립. 단 **쓰기-안전 축에서만** 성립.
- **배포 타깃 config는 wrapper보다 먼저 확정한다(Claude 조정).** probe는 `workspace-write`+cwd=shadow 조건이었다. RAG 질의응답은 답을 stdout으로만 뱉고 파일을 안 쓰므로, 더 단순한 후보 = **`read-only`+cwd=실repo**. 이게 참이면 shadow/restore/lock 자체가 불필요(완전 병렬 공짜). **단 이건 합의가 아니라 가설** — probe가 read-only도 cwd=실repo 읽기도 검증 안 함. Codex 검증 3문항. ①read-only+실repo 전체읽기 되는가 ②전체쓰기 차단되는가 ③질의응답이 쓰기 0으로 성립하는가. 참이면 이 config로 품질 비교, 거짓이면 workspace-write+shadow로 폴백.
- **남은 진짜 관문 = 품질 + 속도 + 비용.** probe는 안전 기전만 증명했지 GPT exec가 eCAMS 코드를 잘·빨리 답한다는 건 아니다. 사용자 원 통증은 지연이므로 품질 비교는 **속도를 AGY와 명시 대조** 필수. 안전·병렬이어도 답이 더 느리면 통증을 옮길 뿐. 이 관문이 pivot을 아직 죽일 수 있다.
- **shadow/restore/lock은 GPT exec 채택 확정 전까지 유지.** 어떤 것도 미리 걷어내지 않는다.
- Codex 다음 순서. ①config 가설 검증(3문항) → ②`runCodexExecStream` 최소 wrapper(env 경로) → ③AGY vs GPT exec 대조(질문 2~3개, 품질+속도+오염+비용) → ④lock/restore 완화 코드는 채택 확정 전까지 보류.

## 2026-07-01 codex 모델 노출 방식 합의 (Claude 회신 5, to-codex.md)

Codex가 config 3문항 검증 + `runCodexExecStream` wrapper 구현 + 속도 대조를 완료했고, "modelInput=codex를 UI 노출할지" 물었다. Claude가 코드 확인 후 회신.

- **config 가설 참으로 확인.** `read-only`+cwd=실repo에서 repo 읽기 됨(rg 검색 성공, 일부 PowerShell 읽기는 blocked), repo 쓰기 전부 `blocked by policy`, 질의응답 쓰기 0 성립. wrapper는 `codex exec --json --sandbox read-only --cd __dirname --skip-git-repo-check --ignore-rules -`, `CODEX_EXE` env override, `modelInput==="codex"`일 때만.
- **속도.** Q1(server.js 전체읽기) 63.2s, Q2(package.json) 18.5s. AGY는 27~127s 분산 + timeout 304.8s 사례. 작은 질문은 Codex가 빠를 수 있고, 큰 파일 넓게 읽으면 60s대로 AGY 평균권.
- **하드 blocker 발견 = 읽기 스코프 미격리.** wrapper가 `--cd __dirname`(C:\ecams-ai 전체)이고 `allowedRepos`를 받지 않는다(`server.js:2388` vs AGY `server.js:2385`). 은행 소스는 전부 `workspace/<은행>/` 아래라, `read-only`는 쓰기만 막고 읽기 스코프는 격리 안 함 → **광주은행 질문에도 전 고객사 소스가 읽힘 = 고객사 데이터 격리 위반.** 속도 테스트 2건도 봇 자체 코드였지 실 은행소스 질문이 아니라 품질 미측정.
- **결정 — 전면 UI 노출 보류, 관리자 숨은 옵션으로만.** customer/enduser엔 노출 금지(교차누출 최악). admin/developer만 허용해 계속 검증.
- **스코프 수정은 probe 선행(확정 아님).** "`--cd`를 고객사 폴더로 좁힘"은 read-only가 읽기를 cwd로 스코프한다는 미검증 가정. Codex 회신의 "일부 읽기 blocked, rg 읽기 성공"이 모호성 시사. **판별질문 — cwd=고객사A repo, read-only에서 고객사B 절대경로를 읽는가.** 읽기가 cwd로 스코프되면 `--cd` 좁히기로 해결. 안 되면 add-dir read-allowlist 또는 per-customer shadow 유지 필요(→ "read-only면 shadow 불필요" 가설 깨짐, shadow 읽기격리가 load-bearing).
- **다음 순서.** ①read-scope probe → ②결과 따라 `--cd` 좁히기 or add-dir/shadow → ③실 은행소스·persona별 품질+속도 재측정 → ④통과 시 노출 범위 재논의.

## 2026-07-02 대화기록 아이디별 통합

- **결정.** 브라우저별 `localStorage` 대화기록을 로그인 아이디 기준 서버 저장으로 전환한다. 저장소는 `logs/chat_history/<userId>.json` 유저별 파일이다.
- **이유.** 현재 앱이 파일 기반 설정을 사용하고 있어 DB 도입 없이 최소 변경으로 같은 ID·다른 브라우저 기록 통합 문제를 해결할 수 있다.
- **동기화 정책.** 로그인 후 서버 기록과 기존 로컬 기록을 `id`와 `updatedAt` 기준으로 병합한다. 이후 `saveChat`·`deleteChat`은 로컬 캐시를 먼저 갱신하고 서버 API를 best-effort로 호출한다.
- **삭제 정책.** 대화기록 삭제는 화면 기록만 삭제하며, 감사 로그(`answer_log`)는 보존한다.
- **검증.** `node --check server.js`와 `public/index.html` 인라인 스크립트 문법 검사를 통과했다.
- **다음.** 개별 메시지 삭제(#3)를 이 서버 저장 구조 위에 구현한다.

## 2026-07-02 합의 점검 — 충돌 없음, #3 삭제 단위만 사용자 확인 대기

Claude가 `current.md`·`to-codex.md`·`to-claude.md`를 재검토했다. Codex와 Claude 사이에 미해결 충돌은 없다. 현재 라인은 그대로 진행 가능.

- **정렬 확인.** #1(대화기록 아이디별 통합) 완료, #3(개별 메시지 삭제)이 다음 액션이라는 점에서 Codex·Claude 합의 일치. codex 사용량 한도 실측은 별도 미결 항목으로 #3과 무관하게 병행 가능.
- **삭제 단위 확정(사용자 승인).** #3은 "질문+답변 turn 쌍" 단위로 삭제한다. 화면 기록만 지우고 감사 로그(`answer_log`)는 기존 정책대로 보존한다. Codex는 이 단위로 바로 구현하면 된다.

## 2026-07-02 개별 메시지 삭제 구현

- **결정.** 사용자 메시지 버블에 삭제 버튼을 두고, 클릭 시 해당 질문과 바로 다음 AI 답변을 함께 삭제한다.
- **진행 중 응답.** 스트리밍 중에는 삭제를 막는다. DOM에는 아직 완성 답변이 없고 `messages` 배열도 최종 저장 전이라, 삭제 허용 시 화면과 저장 상태가 어긋날 수 있기 때문이다.
- **빈 대화.** 마지막 turn 삭제로 메시지가 0개가 되면 대화기록 항목 자체를 제거한다.
- **보존.** 서버 대화기록과 브라우저 캐시는 갱신하지만 감사 로그는 삭제하지 않는다.

## 2026-07-02 대화 삭제가 되살아나는 버그 수정 (Claude)

- **증상.** 삭제한 대화가 새로고침 몇 번 뒤 다시 나타남(사용자 실사용, admin "결재 문제" 대화). PUT/DELETE 요청 순서 경합 + `loadChatHistoryFromServer` 병합 로직이 "로컬에서 지운 id"를 구분 못 하는 구조적 결함 두 가지가 원인으로 확정됐다.
- **수정(1차, 불충분함).** PUT/DELETE를 chatId별로 직렬화(`queueChatSync`)하고, `chatHistoryDeleted` localStorage tombstone으로 재시도하도록 했다. 하지만 이건 기기별 저장소라 **모바일이 데스크탑의 삭제를 알 방법이 없어 여전히 되살아남**(사용자 재현: 데스크탑에서 확정 삭제 후 모바일 진입 시 부활).
- **근본 수정.** tombstone을 서버로 옮겼다. `server.js` DELETE는 항목을 지우는 대신 `{deleted:true, updatedAt}`으로 남기고, PUT은 기존 항목(툼스톤 포함) updatedAt이 더 크거나 같으면 거부(last-write-wins)한다. GET은 툼스톤도 포함해 응답하고, 클라이언트 병합은 서버/로컬을 updatedAt으로 비교해 최신만 채택한 뒤 deleted만 화면에서 거른다. 기기 간 삭제 전파가 이제 서버 단일 소스로 정확히 보장된다. localStorage 전용 tombstone 코드는 제거.
- **검증.** `node --check server.js` 통과. 서버+클라이언트 로직을 복제한 격리 스크립트로 4개 시나리오(툼스톤 생성, 늦은 PUT 거부, 모바일 옛 캐시 안 되살아남, 새 로컬 대화 유지) 통과. pm2 재시작 완료.
- **다음.** 데스크탑 삭제 → 모바일 확인 실사용 재현 검증 필요.

## 2026-07-02 답변 포맷 경직성 완화

- **판단.** 사용자의 이전 지적처럼 비분석형 질문에서 기존 포맷 강제가 품질을 떨어뜨리는 것은 맞다. 다만 완전 자유화는 `stripAgyPreamble`의 소스누출 제거 앵커와 enduser 렌더 개선의 고정 제목 의존성을 흔들 수 있어 채택하지 않는다.
- **결정.** 개발자/admin용 `SYSTEM_PROMPT`에 **형식 C — 설계/신규 요구**를 추가한다. 질문이 "설계해줘", "새로 만들어줘", "추가하고 싶어", "정책 정리", "md로 정리" 유형이면 기존 실행 흐름/로직 상세 포맷 대신 요구사항 정리, 현행 구조, 설계안, 변경 대상, 미결정 사항으로 답한다.
- **안전장치.** `## 0. 분석 근거` 공통 앵커는 유지한다. 따라서 `stripAgyPreamble` 수정 없이 기존 소스누출 방어를 계속 쓴다.
- **문서 산출물 정책.** AGY 응답 환경에서는 생성 파일을 사용자 화면에서 열거나 다운로드할 경로가 없으므로 "md 파일을 만들었다"고 말하지 않는다. 사용자가 md 파일, 설계서, 정리본을 요청하면 답변 본문에 완성된 Markdown 문서 형태로 제공한다.
- **enduser.** 고객사 직원 persona는 기존 화면 조작 안내 원칙을 유지한다. 단, 파일 생성 약속 금지는 공통 적용한다.
