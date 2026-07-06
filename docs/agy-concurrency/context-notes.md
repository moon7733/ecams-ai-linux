# Context Notes - AGY same-repo 동시성 개선

## 2026-07-01 선행 검증 결론

same-repo 직렬화의 직접 원인은 `server.js`의 `withRepoLock(repos, fn)`이다. `requestQueue`는 `MAX_CONCURRENT = 3`으로 최대 세 요청을 병렬 실행하지만, 실제 모델 실행 직전에 모든 모델 경로가 `withRepoLock(allowedRepos, ...)` 안으로 들어간다. 같은 repo root를 가진 요청은 이전 작업의 promise tail을 기다린다.

`restoreModifiedFiles`는 그림자 격리 이후에도 원본 workspace를 대상으로 한다. 함수는 `git diff --name-only -- <repoRoot>`로 실행 전후 변경 파일을 비교하고, 실행 중 새로 수정된 tracked 파일을 `git checkout -- <file>`로 복원한다. 따라서 단순히 "AGY가 그림자에서만 돈다"는 이유로 restore와 repo lock을 제거하면 안 된다.

기존 `docs/repo-shadow-isolation/context-notes.md`의 중대 한계가 여전히 유효하다. AGY의 Read/Edit/Grep 도구는 `.shadow` add-dir로 가둘 수 있지만, AGY 셸 도구는 cwd/add-dir 밖 원본 filesystem을 볼 수 있고 실제 원본 파일을 수정한 실증 기록이 있다. 그래서 현재 방어선은 그림자 미러와 원본 snapshot-restore의 조합이다.

## 선택지 판단

- B안(읽기 전용은 락 없이 또는 락 제거)은 현 상태에서 기각한다. restore가 레거시 no-op이 아니고, AGY 셸 우회가 원본을 건드릴 수 있다.
- A안(그림자 슬롯 풀)은 공유 `.shadow` 미러 간섭을 줄이는 데는 맞지만, 셸 우회 원본 수정과 restore 간섭까지 자동 해결하지 않는다. 슬롯 풀은 AGY 셸 sandbox 또는 원본 접근 차단 전략과 함께 설계해야 한다.
- C안(enduser 우선)은 UX 개선 후보지만, 현재 `withRepoLock`이 이미 실행 중인 developer 요청을 막고 있으면 enduser를 앞세워도 preemption은 불가능하다. enduser가 소스탐색·수정 경로를 타지 않는다는 실측이 있으면 enduser만 lock 밖으로 분리하는 작은 개선은 검토할 수 있다.

## 디스크 비용 실측

2026-07-01 로컬 측정.

- `workspace\광주은행\kjbank_html5`는 4,760파일, 156.7MB다.
- `workspace\광주은행\kjbank_server`는 969파일, 29.5MB다.
- 현재 `.shadow`는 9,854파일, 53.5MB다. 제외 패턴 때문에 원본 전체보다 작다.

슬롯 풀을 `MAX_CONCURRENT = 3`과 묶으면 광주은행 html5+server 기준 대략 수백 MB 규모라 디스크 비용만 보면 감당 가능하다. 다만 wiki/indexes까지 포함하고 은행 수가 늘면 slot별 누적 비용을 다시 측정해야 한다.

## 슬롯 풀 구현 시 주의

현재 `shadowPathFor`, `neutralizeShadowPaths`, `prepareShadows`는 전역 `SHADOW_ROOT`에 묶여 있다. 슬롯 풀을 만들려면 `shadowRoot`를 함수 인자로 전달하거나 요청 컨텍스트에 포함해야 한다.

`neutralizeShadowPaths`는 치환 목적지를 `path.resolve(SHADOW_ROOT, 'workspace')`로 고정한다. 슬롯별 root를 쓰면 `C:/ecams-ai/workspace`를 `C:/ecams-ai/.shadow-slot-N/workspace` 같은 해당 슬롯 경로로 치환해야 한다. 그렇지 않으면 index 헤더가 다른 슬롯 또는 기존 `.shadow`를 가리키는 누출 경로가 된다.

`decodeJavaEscapesInShadow`는 전달받은 `shadowDir` 내부만 훑으므로 슬롯별 root에서도 비교적 안전하다.

## 다음 액션

가장 작은 다음 작업은 enduser RAG 요청이 실제로 AGY 소스탐색·수정 경로를 타지 않는지 로그로 확인하는 것이다. 확인되면 enduser 요청만 repo lock 밖으로 빼거나 별도 light lock으로 보내는 C'안을 검토한다.

근본 개선을 하려면 먼저 AGY `--sandbox`가 셸 도구의 원본 workspace 접근을 막는지 probe한다. 막히면 A안 슬롯 풀을 진행할 수 있고, 막히지 않으면 제한 OS 계정이나 컨테이너처럼 원본 경로 자체를 감추는 방식을 먼저 결정해야 한다.

## 2026-07-01 restore 계측과 sandbox probe

Claude 회신 2에 따라 `restoreModifiedFiles` 로그에 `userId`, `persona`, `model`, `jobId`, `repos`를 붙였다. 복원 대상이 있을 때 콘솔 `[Restore]`와 `logs/agy_debug.log`에 `RESTORE_START`, `RESTORE_FILE ok/fail`, `RESTORE_ERROR`를 남긴다. 동작 변경은 없고, persona별 원본 쓰기율과 C' 변형2 위험 판단을 위한 계측이다.

AGY sandbox probe는 실 workspace 대신 `scratch/agy-sandbox-probe` 안에 throwaway 원본 절대경로와 shadow add-dir를 만들고 실행했다. cwd와 add-dir는 shadow로 제한하고, 프롬프트는 add-dir 밖 절대경로인 `scratch/agy-sandbox-probe/workspace-real/probe.txt`에 마커를 쓰도록 했다.

5단계 결과.

- 플래그 확인. `agy.exe --help`와 `agy.exe -p --help` 모두 `--sandbox`를 표시했다.
- 격리. 실데이터가 아니라 `scratch/agy-sandbox-probe` throwaway 파일만 사용했다.
- OFF 대조. sandbox OFF에서 `probe.txt`가 `OFF_1782885942587`로 수정됐다. probe가 절대경로 우회를 탐지할 수 있음을 확인했다.
- ON 검증. sandbox ON에서도 `probe.txt`가 `ON_1782885951721`로 수정됐다. 따라서 현재 AGY `--sandbox`는 이 절대경로 쓰기 우회를 막지 못한다.
- 부작용 확인. sandbox ON에서 shadow add-dir의 `readme.txt` 읽기는 `SHADOW_READ_OK` 출력으로 정상 확인됐다.

결론. `--sandbox`는 add-dir 정상 읽기를 깨지 않지만, 원본 절대경로 쓰기를 차단하지 못했다. 따라서 sandbox를 전제로 restore/lock 제거 또는 A 슬롯풀을 바로 진행하면 안 된다. 다음 설계는 제한 OS 계정, ACL, 컨테이너, 또는 AGY 실행 전용 격리 런타임처럼 원본 경로 자체를 쓰기 불가로 만드는 방식을 검토해야 한다.
