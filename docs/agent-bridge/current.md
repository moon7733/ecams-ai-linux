# 현재 협업 상태

## 현재 목표

eCAMS AI 개발을 Codex와 Claude Code가 공용 문서 기반으로 핑퐁하며 진행한다.

## 현재 합의

- 일반 AI 질문은 AGY hot path를 우선한다.
- 무료 Gemini 키는 되묻기와 임베딩 보조에만 사용한다.
- OpenRouter, DeepSeek API, OpenAI API 키 기반 경로는 삭제 후보로 본다.
- GPT 계열은 API 키가 아니라 월구독 세션 기반 exec 방식만 후보로 둔다.
- 복잡한 문제는 Codex가 로컬 검증과 문서화를 맡고 Claude Code가 설계 검토를 맡는다.
- bridge 갱신 후 Codex는 사용자가 다음에 어느 도구에 어떤 한 줄을 보내면 되는지 명시한다.

## 진행 중인 쟁점

- AGY bail 근본원인 확정됨(아래). `isAgyBail`이 exitCode를 무시해 timeout(code=1) 실패가 재시도·스트리밍·에러표시를 다 빠져나가 영문 garbage가 최종 답변으로 노출됨. 수정 설계는 `to-codex.md` 참고.
- 사용자는 첫 AGY 시도가 5분 안에 timeout으로 종료되면 재시도하지 않고 질문 범위를 좁혀달라는 정적 안내를 반환하는 방향을 승인함.
- 유료 dead path 제거 순서는 Claude가 승인함(fallback 정리만 1번 커밋으로 앞당김). 유료 키는 OpenRouter 하나뿐 확정.
- Codex CLI exec probe는 여전히 `Access is denied`. 삭제와 무관하게 환경 권한 문제부터 별도 해결 필요.
- 합의 내용은 `docs/agent-bridge/decisions.md`, `docs/project-audit-20260701/context-notes.md`, `docs/agy-perf-redesign/context-notes.md`, `docs/agy-bail-retry/context-notes.md`에 반영 완료.

## 다음 액션

- Codex는 dead path 제거 1~4단계를 완료했다. `server.js`의 유료 API 답변 경로와 `.env`의 `DEEPSEEK_API_KEY`를 제거했고, `node --check server.js`와 `npm run build:cm`을 통과했다.
- Claude는 병렬로 AGY bail 수정 2종(isAgyBail exitCode/한글 판정, timeout 정적 안내)을 구현안으로 상세화한다. → 완료. `docs/agy-bail-retry/plan.md` 개정 섹션에 4개 변경 diff 명세 + 검증 기준. 실제 코드 적용은 Codex dead path 커밋 완료 후.
- AGY bail 수정 적용 완료 (커밋 d8f992d7). 사용자 C 선택으로 사용자 변경 3건 동반 커밋.
- fix A 완료 (커밋 6779decd). 신규 발견 — code=0/300s+/37자 6건이 text-bail 재시도로 최악 15분. 사용자 결정 SLOW_BAIL_MS=180s(3분)로 버킷 C 추가. 관측 6건 이제 1회 종료. 제어흐름 7/7 + node --check OK.

## Codex 부재 — Claude가 인계 (2026-07-01)

- Codex 로컬 실행 불가 상태. 핸드오프 항목을 Claude가 인계함.
- 완료. dead path 제거+fallback 방어(Codex 112f1511), .env DEEPSEEK 제거(같은 커밋), bail 수정(d8f992d7), 느린 bail 가드(6779decd).
- **B(E2E) 부분 완료.** ok 버킷(정상 통과·재시도 없음)은 실사용에서 확인됨(답이 계속 정상으로 옴 = 회귀 없음). timeout/slow-bail은 AGY 비결정성으로 강제 재현이 안 돼, **실사용 중 실제 timeout 발생 시 SCOPE_GUIDE 정상 노출되면 확인 완료로 간주**(사용자 결정 2026-07-01). 그때까지 라이브 관찰 대기.
- 보류. C(GPT exec probe) — codex CLI가 목적인데 codex 실행 자체가 막힘(Access denied). 환경 권한 해결 후로.
- 후속(낮음). timeout/slow-bail 안내를 clarifier 연결(현재 정적), text-bail maxAttempts=3 확정.

## enduser 소스 누출 재수정 (2026-07-01, 커밋 db89df89)

- enduser 답변에 agy 서브에이전트 grep 덤프 + `[[uuid/task-N] status]`/`[task-N stdout]`가 누출됨(answer_log_20260701 실증). `stripAgyPreamble`가 "첫 한글 라인 이전만 스킵"이라 grep 라인의 한글 코드주석에 걸려 안 잘림.
- 수정. 실제 답변 헤더 substring anchor 슬라이스 + orchestration 마커만 있고 anchor 없으면 bail 유도. 로그 fixture 검증 + 회귀 7/7 통과. **사용자 실사용 확인 완료** — enduser 동일 질문에서 grep 덤프 안 나옴.

## enduser 답변 렌더 개선 (2026-07-01, 커밋 6df7bf3a·731ec167)

- 줄바꿈 뭉개짐 + 숫자 강조 불일치. 원인은 모델측 whitespace 변덕(런마다 `#`·번호·개행 들쭉날쭉). 두더지잡기 대신 고정 제목(한 줄 요약/따라하기 단계/주의할 점)에 앵커해 `##` 헤더로 승격 → 양방향 글루 해소 + 상위=헤더/하위=번호로 숫자중첩 모호성 제거(모델 협조 불필요). 실제 로그 2런 검증. **사용자 실사용 확인 완료.**

## 쟁점 — same-repo 동시성 직렬화 (2026-07-01, 코덱스와 결정 대기)

- 진단 확정. 같은 은행 repo면 `withRepoLock`(server.js:918)이 의도적으로 직렬화 → 느린 developer 요청이 같은 repo의 다른 사용자를 최대 5분 막음. 근본 이유는 단일 공유 `.shadow` 미러. 상세 진단 + 개선 선택지(A 슬롯풀 / B 락제거 / C enduser우선 / D UX)는 **`to-codex.md`에 정리 완료.**
- 다음. Codex가 선행 검증(restore 실효성·디스크비용·슬롯 멱등성) 후 함께 방향 확정. 합의되면 `docs/agy-concurrency/` 생성 + decisions.md 반영.
- Codex 선행 검증 완료. `docs/agy-concurrency/` 생성 완료. B안(락 제거)은 `restoreModifiedFiles` 원본 실효성과 AGY 셸 우회 위험 때문에 기각. A안(슬롯 풀)은 디스크 비용은 가능하지만 셸 우회 방어 없이 바로 적용하면 위험. 다음은 enduser RAG 요청이 소스탐색·수정 경로를 타지 않는지 로그로 확인하고, 안전하면 enduser만 lock 밖으로 분리하는 C'안을 검토한다.
- **Claude 회신 2 완료(합의).** restore 실발생 실증(admin 2건, 원본 .jsp/.java 수정)으로 B 기각 확정. persona=프롬프트 경계 증명. **핵심 반전 — `snapshotModifiedFiles`가 전역 git diff라 C' 변형1(restore 유지·lock 제거)은 동시 developer 수정을 되돌려 안전하지 않음.** C'는 sandbox probe 전까지 보류. 확정 순서 ①restore 로그 persona 계측 → ②sandbox probe → ③결과에 따라 A(전 persona 병렬) 또는 C' 변형2 임시완화. 상세는 `to-codex.md` "Claude 회신 2", 합의는 `decisions.md`.
- **Claude 회신 3 완료(합의).** Codex가 계측+sandbox probe 완료. **probe 결과 `--sandbox`가 원본쓰기 못 막음(OFF·ON 둘 다 수정) → sandbox 기각 확정, 영구 제외.** OS 레벨 쓰기격리가 근본책이나 dev PC엔 큰 공사(서버 자신이 workspace 써야 해서 AGY 자식을 별도 제한계정으로 스폰해야 성립). **Track 1(OS격리→완전병렬) vs Track 2(lock 유지+우선순위/대기표시로 지연완화) 사용자 선택 대기.** Codex는 제한계정/ACL feasibility 소probe 병렬 진행 가능, lock 완화는 probe+사용자선택 전까지 보류. 상세 `to-codex.md` "Claude 회신 3".
- **사용자 결정(전략 전환).** Track 1·2 둘 다 **보류**. agy가 통제 불가(원본 무단 수정, sandbox로도 못 막음)라, 격리 벽을 쌓느니 **모델을 GPT exec 방향으로 먼저 전환 검토**하기로 함. Codex CLI(GPT exec)의 read-only/workspace-write 권한 모드가 실제 원본쓰기를 막으면 통제불가 수정 제거 + restore/lock 불필요(완전 병렬)를 한 번에 해결. 선행 blocker = `codex --help` Access denied 해소. 동시성은 모델 전환 결과에 종속시켜 보류. 상세 `to-codex.md` "사용자 결정" 섹션.
- **Codex probe 완료 + Claude 회신 4 합의(2026-07-01).** ①Access denied 해소(PATH alias 문제, AppData 바이너리 정상 → env 설정값으로 보관). ②GPT exec `workspace-write`가 원본쓰기 **실제 차단**(AGY sandbox와 달리) = 모델 전환 계속의 1차 증거. **Claude 조정** — 배포 config를 wrapper보다 먼저 확정(가설. `read-only`+cwd=실repo면 shadow/restore/lock 자체 불필요, Codex 3문항 검증 대기). **남은 관문 = 품질+속도+비용**(probe는 안전 기전만 증명, 사용자 원 통증은 지연이라 속도 AGY 대조 필수). shadow/restore/lock은 채택 확정 전까지 유지. 상세 `to-codex.md` "Claude 회신 4", `decisions.md`.
- **다음(Codex).** ①config 가설 검증(read-only+실repo) → ②`runCodexExecStream` wrapper → ③AGY vs GPT exec 품질·속도·오염·비용 대조 → ④lock 완화 보류.
- **Codex 후속검증 완료 + Claude 회신 5(2026-07-01).** config 3문항 참 확인, wrapper 구현(`--cd __dirname` read-only), 속도 대조(Q1 63.2s/Q2 18.5s vs AGY 27~127s). **하드 blocker 발견** — wrapper가 `--cd C:\ecams-ai 전체` + `allowedRepos` 미전달이라 read-only가 쓰기만 막고 **읽기 스코프 미격리 → 광주은행 질문에 전 고객사 소스 읽힘(격리 위반).** 속도테스트도 봇 자체코드라 실 은행소스 품질 미측정. **결정 — 전면 UI 노출 보류, 관리자 숨은 옵션(admin/developer)만, customer/enduser 금지.** 스코프 수정은 read-scope probe 선행(cwd=고객사A, read-only에서 고객사B 절대경로 읽히나). 상세 `to-codex.md` "Claude 회신 5", `decisions.md`.
- **다음(Codex).** ①read-scope probe → ②결과 따라 `--cd` 좁히기 or add-dir/shadow → ③실 은행소스·persona별 품질+속도 재측정 → ④통과 시 노출 재논의.

## GPT exec 검증 진척 — Claude 직접 수행 (2026-07-01, Codex 부재)

Codex 부재로 Claude가 read-scope probe + 품질/속도 측정을 직접 수행했다. 상세 = `docs/gpt-exec-probe/context-notes.md`, 대조표 = `docs/gpt-exec-probe/dev-comparison.md`, 답변원문 = `docs/gpt-exec-probe/answers/`.

- **read-scope probe = 결정적.** Windows에서 `--sandbox read-only`는 **쓰기만 막고 읽기는 디스크 전체 허용**(4 probe 실증, hosts 파일까지 읽힘). cwd/shadow 어떤 파일시스템 트릭으로도 읽기격리 불가 → 회신 5의 "`--cd` 좁히기/add-dir" 갈래 **무의미**. 하드 읽기격리는 OS ACL만 유효. **단 AGY 대비 회귀 아님**(AGY도 절대경로 읽기 가능), 원 목표(쓰기안전·동시성)와 별개. write-safety/동시성 win은 유효.
- **속도 레버 probe.** reasoning=low는 불명확(websocket 오염). **컨텍스트 사전주입 = 3.4배(289→85s), 품질 유지**. codex 속도는 모델 아니라 **live 탐색이 지배** — 사전주입(enduser `getGuideKnowledge` 방식)으로 완화 가능.
- **developer 질문 3개 대조 = 반전.** AGY(Flash 3.5) 3/3 완주·**환각 0**(Q2 실제 NPE버그 발견+diff, Q3 requestType 31/33, 44~92s). **codex(gpt-5.4-mini) 3/3 실패** — Q1 websocket 끊김, Q2·Q3 **`usage limit 초과`(구독 사용량 한도, 리셋 7:37PM)**. 무거운 질문 1개가 한도 소진→계정 잠김 = **멀티유저 하드 블로커.** codex 품질 자체는 문제 아님(289s 샘플 정확).
- **현재 판정.** 속도·정확도·안정성 종합 시 **AGY 우위**(무료·안정·환각0). codex 관문은 품질 아니라 ①사용량 한도(최대) ②websocket ③live탐색속도.

### codex 재측정 완료 (한도 리셋 후) — 3/3 성공

- codex Q1~3 재측정 = **3개 다 성공.** Q1 337.7s, Q2 232.5s, Q3 165.3s(전부 AGY 대비 ~3.5배 느림, live 탐색). 대조표·원문 반영 완료(dev-comparison.md, answers/codex_q*.md).
- **품질 = AGY와 대등, 검증지표선 codex 근소 우세**(Q3 requestType 33/33 vs 31/33, Q2 NPE codex 3곳 vs AGY 1곳+diff, 둘 다 환각 0).
- **종합 우위는 여전히 AGY**(무료·안정·3.5배 빠름). codex 관문 = ①사용량 한도(멀티유저 최대 블로커, 2차 성공은 리셋 직후일 뿐) ②속도(사전주입으로 완화가능) ③websocket.

### 다음 (미결)

- **codex 사용량 한도 실측** — 실제 상한(요청수/토큰/시간창)과 멀티유저 고갈 속도. 채택 가부의 핵심. 한도가 실사용을 못 버티면 품질 무관 보류.
- 채택 방향이면 codex를 live 탐색이 아니라 **사전주입(repo-map/가이드) 아키텍처**로 붙여 속도·토큰을 함께 줄이는 설계.

## 추가 쟁점 — 대화기록/UX 3건 (2026-07-01, 사용자 요청, 코덱스와 결정 대기)

- #1 대화기록 아이디별 통합 — 현재 브라우저 localStorage 저장(서버 유저별 저장 없음, index.html:2506). 서버측 저장 필요.
- #2 현재 고객사 상시 표시 — ✅ 완료(커밋 bb743ca8). 헤더 칩, 이전 대화 로드 시 그 대화 고객사 표시 포함. 하드리로드 반영, 실사용 확인 대기.
- #3 개별 메시지 삭제 — 대화 단위 삭제는 이미 있음(deleteChat). 사용자는 **메시지 단위** 삭제 원함. #1(서버저장) 위에서 동기화 포함 구현.
- 상세 진단·방향·Codex 선행확인은 **`to-codex.md` 추가 쟁점 섹션**에 정리. 권고 순서 #2→#1→#3.

### Codex 진행 (2026-07-02)

- **#1 대화기록 아이디별 통합 구현 완료.** `logs/chat_history/<userId>.json` 유저별 저장소와 `GET/PUT/DELETE /api/chat/history` API를 추가했다.
- 프론트는 로그인 후 서버 기록과 기존 `localStorage` 기록을 병합하고, 이후 `saveChat`·`deleteChat`이 서버에 best-effort 동기화된다. `localStorage`는 캐시로만 남는다.
- 검증. `node --check server.js` 통과, `public/index.html` 인라인 스크립트 8개 문법 검사 통과.
- **#3 개별 메시지 삭제 구현 완료.** 삭제 단위는 사용자 확정대로 질문+바로 다음 AI 답변 turn 쌍. 진행 중 응답 중에는 삭제를 막고, 마지막 turn 삭제로 대화가 비면 해당 대화 기록도 제거한다. 화면 기록만 삭제하며 감사 로그(`answer_log`)는 보존한다.
- 검증. `node --check server.js` 통과, `public/index.html` 인라인 스크립트 8개 문법 검사 통과.

## 버그 수정 — 삭제한 대화가 새로고침 몇 번 뒤 되살아남 (2026-07-02, Claude)

- **증상(사용자 실사용).** admin 계정 "결재 문제" 대화(질문 1개, 되묻기만 오고 답변 없음)를 삭제하면 처음엔 화면에서 사라지는데, 새로고침을 몇 번 하면 다시 나타남. 모바일도 동일. 되묻기 유무와 무관하게 재현됨(사용자가 여러 번 새로고침해 확인).
- **근본원인 2가지, 둘 다 고쳐야 함.**
  1. **경합.** `saveChat`(질문 전송 시 PUT, 결정 13 선영속화)과 `deleteChatFromServer`(삭제 시 DELETE)가 둘 다 fire-and-forget이라 순서 보장이 없다. 되묻기처럼 왕복이 빠르면 DELETE가 먼저 도착하고 뒤늦게 도착한 PUT이 그 위에 대화를 재생성할 수 있다.
  2. **구조적 원인(더 큼).** `loadChatHistoryFromServer`의 병합 로직이 로컬·서버 양쪽에 다 있는 id만 비교해서 최신값을 고른다. 로컬에서 완전히 지워 로컬 목록에 그 id 자체가 없으면, DELETE 요청이 새로고침으로 끊기거나 네트워크 문제로 서버에 못 닿았을 때 **그 어떤 안전장치도 없이 서버 사본이 그대로 되살아난다.** 사용자가 삭제 직후 바로 새로고침하면 브라우저가 진행 중이던 DELETE 요청을 취소할 수 있어, 이 경로가 실제로 잘 걸린다.
- **수정.** `public/index.html`.
  1. `syncChatToServer`/`deleteChatFromServer`를 chatId별 promise 체인(`queueChatSync`)으로 직렬화 — 경합 제거.
  2. `chatHistoryDeleted`(localStorage) 삭제 tombstone 목록 추가. `deleteChat`/`deleteTurn`의 전체삭제 분기에서 `markChatDeleted(id)`로 기록. `loadChatHistoryFromServer` 병합 시 tombstone에 있는 id는 서버에 남아 있어도 되살리지 않고 그 자리에서 DELETE를 재시도하며, 서버에서도 확인되면 tombstone에서 뺀다 — 새로고침마다 자가치유.
- **검증.** 인라인 스크립트 문법 검사(Function 생성자 파싱) 통과. 서버(`server.js`) 변경 없음. 실사용 재현 검증은 배포(하드리로드) 후 필요.

## 정정 — 위 수정으로 부족했음. 진짜 원인은 기기 간(cross-device) 동기화 (2026-07-02, Claude)

- **사용자 재현.** 데스크탑에서 삭제하고 새로고침 몇 번으로 데스크탑에서는 확정 삭제된 것처럼 보였는데, **모바일로 들어가는 순간 그 대화가 다시 살아났다.**
- **왜 위 수정(localStorage tombstone)으로 못 막았나.** `chatHistoryDeleted` 기억 목록을 브라우저 `localStorage`에 뒀는데, 이건 **기기별로 완전히 분리**돼 있다. 데스크탑이 지운 사실을 모바일은 전혀 모른다. 모바일은 삭제 이전에 캐시해둔 옛 대화를 그대로 들고 있다가, `loadChatHistoryFromServer` 병합에서 "서버에 이 id 가 없으면(그런데 서버는 실제로 지워서 안 보내니까 없는 게 맞음) 로컬을 그대로 채택"하는 로직 때문에 **자기 로컬 캐시를 서버에 다시 PUT 으로 올려 되살렸다.** 로컬 전용 tombstone은 근본적으로 기기 간 삭제를 전파할 수 없는 방식이었다.
- **근본 수정 — 서버가 삭제를 tombstone 으로 기억.** `server.js` `DELETE /api/chat/history/:id`가 항목을 지우는 대신 `{id, deleted:true, updatedAt:now}` 로 남긴다. `PUT`은 기존 항목(툼스톤 포함)의 `updatedAt`이 들어온 값보다 크거나 같으면 **거부**한다(last-write-wins). `GET`은 툼스톤도 그대로 포함해 응답한다.
- **클라이언트.** `public/index.html`의 병합 로직을 last-write-wins로 다시 짰다 — 서버 항목(활성/삭제 불문)과 로컬 항목을 `updatedAt`으로 비교해 더 최신 쪽을 채택하고, 최종적으로 `deleted:true`인 것만 화면에서 걸러낸다. 이전에 넣은 `chatHistoryDeleted`/`markChatDeleted` 로컬 전용 코드는 제거했다(서버 툼스톤이 상위 호환).
- **검증.** `node --check server.js` 통과. 서버 함수(정규화/read/write/put/delete)와 클라이언트 병합 로직을 그대로 복제한 격리 스크립트로 4개 시나리오(삭제 직후 tombstone 생성, 늦게 도착한 PUT이 tombstone을 못 덮어씀, 모바일 옛 캐시가 있어도 화면에 안 보임, 서버에 없는 새 로컬 대화는 유지) 전부 통과. pm2 재시작 완료.
- **사용자 실사용 확인 완료(2026-07-02).** 데스크탑 삭제 → 모바일 진입 시 재현 안 됨. "정상확인했어 잘삭제된다."
