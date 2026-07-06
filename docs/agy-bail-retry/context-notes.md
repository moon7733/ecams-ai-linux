# Context Notes - AGY bail 자동 재시도

## 결정 사항 및 근거

- **claude 폴백이 아니라 AGY 재시도** (사용자 결정 "다시 agy 그대로"). 근거. AGY 비결정성은 재시도로 대개 해소(1·2차 bail → 3차 정상 실측). claude 비용 없음, 답변 스타일 일관. 단점은 지연 누적.
- **bail 감지 = 길이 + 문구**. 실측 bail 2건. `cleanLen=117` "I am waiting for the file search to complete...", `cleanLen=112` "I am waiting for the background search to complete to verify...". 정상은 cleanLen 2400+ (분석 템플릿 강제). → < 200자 또는 특유 문구로 감지.
- **실패 시도 출력 억제**. runAgyOnce 가 답변을 버퍼링해 종료 시 1회 res.write — bail 이면 그 write 를 건너뛰어 garbage 가 사용자에게 안 보이게. 성공 답변만 노출.
- **maxAttempts=3**. "3차에 성공" 패턴 반영. bail 은 35~45s 로 빨라 3회도 ~2~3분. 진짜 hang(print-timeout 5m)은 드물어 일단 허용.

## 관련

- 이 기능은 [repo-shadow-isolation] 의 후속. 그림자가 AGY 의 파일수정을 무효화하니 bail 시 빈약 텍스트가 드러나 재시도 필요성이 생김. 그림자 격리 자체는 정상 동작(원본 보호 실증).
- AGY 비결정성은 프로젝트 기존 결론과 일치(agy-workspace-protection 노트, repo-map-poc Haiku/Sonnet 권고).

## 검증 (2026-06-24)

- `isAgyBail` 단위검증: 실측 bail 3건(117·110·37자) 모두 true, 정상 답변(1580자) false.
- 캡처한 실 server 프롬프트로 그림자 node-pty replay: **attempt 1 즉시 성공**(54s, 2262자, bail=false), 원본 미수정. → V2(첫 성공 시 재시도 없음)·V4(원본 보호) 확인. V1(실제 bail→재시도→회수)은 이번에 AGY 가 bail 안 해 직접 관측 못 함(로직은 단순·검증됨, 실서버에서 bail 시 발동).
- 임시 진단(last_agy_prompt.txt 캡처)·scratch 테스트 파일 제거 완료.

## ⚠️ 다음 세션 — 서버 재시작 필요

현재 pm2 에 떠 있는 server 는 **재시도 코드가 아직 안 올라간 버전**(직전 재시작은 프롬프트 캡처용이었고 그 뒤 재시도 구현). 재시도를 라이브로 만들려면 `npx pm2 restart ecams-bot` 후 실 UI 에서.
- 수정질문 1건 → bail 시 "재시도 N/3" 뜨고 결국 정상 답변(또는 3회 실패 안내) → 사용자에게 "waiting for search" placeholder 안 보여야 함.
- 원본 파일 미수정 재확인.

## 미해결 / 향후

- 재시도 시 프롬프트 nudge("백그라운드 검색 말고 즉시 완료") 추가하면 성공률 오를 수 있으나, 사용자가 "그대로 재시도" 원함 → 일단 동일 프롬프트.
- 진짜 hang 대비 attempt 별 타임아웃 단축 고려(현재 5m).

## 2026-07-01 Codex-Claude 합의로 갱신

- 기존 "길이 + 문구" bail 감지는 timeout 실패를 놓친다. 실제로 `exitCode=1` timeout이 3125자 영문 계획 출력 때문에 `>300자` 정상 판정을 통과했다.
- 다음 수정에서는 `isAgyBail`에 `exitCode`와 한글 유무를 넘겨 판정해야 한다. `exitCode!==0`이거나 한글이 전혀 없으면 길이와 무관하게 bail 또는 실패로 본다.
- attempt 별 `--print-timeout 5m`은 유지한다. 느린 정상 답변 로그가 있어 타임아웃을 줄이는 방식은 회귀 위험이 크다.
- 최악의 3회 15분 대기는 `runAgyWithRetry` 전체 wall-clock 예산으로 막는다. 구체값은 6분 또는 7분 중 사용자 결정이 필요하다.
- timeout 실패는 기존 nudge 재시도 대상이 아니다. 질문 범위를 좁히라는 안내를 반환하는 쪽으로 합의했다.

## 2026-07-01 Claude 구현 적용 (Codex dead path 커밋 후)

- Codex 커밋 `112f1511 refactor: remove paid AI chat paths` 완료 확인 후, bail 4개 변경을 server.js에 적용했다. bail 함수는 라인 이동됨(isAgyBail:1830, runAgyOnce:1869, runAgyStream:1945, runAgyWithRetry:1980).
- 변경 3에서 기존 `runAgyStream`의 `code!==0 && !state.answer` 에러 텍스트 write를 제거했다. 이유는 timeout 답변(3125자)이 있으면 `!state.answer`가 false라 어차피 스킵됐고, 이제 안내를 `runAgyWithRetry`가 두 버킷으로 전담하기 때문이다. 중복·이중출력 방지.
- 변경 4는 `bailType`이 아니라 `code`를 우선 분기한다. `runAgyOnce`의 early-resolve(spawn/write 실패, code=-1)는 onExit를 안 거쳐 `state.bailType`이 undefined이므로, bailType만 보면 인프라 실패가 text-bail 재시도로 새어나간다. code=-1(인프라 에러)과 code!==0(timeout)을 다른 문구로 분리했다.
- `isAgyBail` 단위 케이스표 5건 통과. 핵심 회귀 케이스인 "code=0 한글 3772자(292초급 정상 답변)"가 false(정상)로 나오는 것을 확인했다. timeout garbage("code=1 영문 3125자", "code=0 한글없음 3125자")는 둘 다 true(bail)로 잡힌다.
- `node --check server.js` 통과. 임시 테스트 스크립트는 제거했다.
- **미완**. (1) 커밋 보류 — server.js에 사용자 미커밋 변경 3건(`<br>` 금지 규칙, cols 200→20000, select-cache 기본값 agy→claude)이 섞여 있어 내 bail 변경만 분리 커밋할지 사용자 확인 필요. (2) 실 UI E2E는 서버 재시작 후 사용자 검증 대기. sample_db SQL 조회형으로 timeout 안내가 재시도 0회로 뜨는지, 정상 질문이 재시도 없이 통과하는지.

## 2026-07-01 신규 리스크 발견 (bail 적용 후 로그 재분석)

- 이전 판단("실패는 timeout code=1 딱 1건")은 불완전했다. `logs/agy_debug.log` 재집계 결과 **code=0인데 180초+ 걸리고 cleanLen<200(대부분 37자)인 케이스가 6건**이다(306s/312s/309s/303s + 210s/199자). AGY가 print-timeout 5m에 안 걸리고 스스로 exit 0 하면서 "I am waiting for the background search..." 37자 placeholder만 낸 것이다. 실질은 timeout인데 exitCode가 0이다.
- 현재 적용된 bail 로직에서 이 6건은 `code!==0` timeout 버킷을 못 타고, `isAgyBail(37자,0)=true`라 **text-bail로 분류 → 재시도**된다. 직전 시도가 이미 5분을 썼는데 재시도 → 또 5분 → 최악 15분. 원래 없애려던 15분 대기를 이 케이스에서 오히려 실현한다.
- 사용자 결정("code=1 timeout이면 재시도 안 함")은 code=1만 다뤘고, 이 "code=0인데 장시간" 케이스는 미포함이다. 새 합의가 필요하다.
- **대응 방향(Claude 제안, 미구현)**. text-bail 재시도에 wall-clock 가드를 추가한다. runAgyStream 반환에 이번 시도 elapsed(state.duration_ms)를 포함하고, `runAgyWithRetry`에서 직전 시도가 임계(예: 3~4분) 이상 걸린 text-bail은 재시도하지 않고 timeout과 동일한 "좁혀달라" 안내로 종료한다. 빠른 text-bail(35~45초)만 재시도 유지.
- 임계 시간 구체값은 사용자 결정 필요.

### 2026-07-01 해결 (커밋 6779decd)

- 사용자 결정. SLOW_BAIL_MS = 180000(3분). 직전 시도가 3분 이상 걸린 text-bail은 재시도하지 않는다.
- 구현. runAgyStream 반환에 durationMs(per-attempt state.duration_ms) 추가. runAgyWithRetry에 버킷 C 신설 — code=0 text-bail이라도 durationMs≥180s면 SCOPE_GUIDE로 종료. timeout·slow-bail 공용 SCOPE_GUIDE 상수화, 문구를 "제시간에"로 완화(slow-bail은 3분 발동이라 "5분 안에"는 부정확).
- 효과(정확한 서술). "15분 제거"가 아니다. 가드는 per-attempt이므로 이론상 최악은 3×180s≈9분(179s 언저리 fast-bail 3연속). 단 실측 대역이 bimodal(35~45s 또는 300s+)이라 그 중간대는 비어 있어 미발생. **관측된 300s+ bail 6건은 이제 1회 시도로 종료**, 빠른 bail만 3회 재시도 유지.
- 검증. 제어흐름 7/7(경계 179s→retry, 180s→guide 포함), node --check OK. durationMs 배선은 코드 리딩으로 확인(onExit가 resolve보다 먼저 실행되어 code!==-1 경로에서 항상 숫자). **단 이 테스트는 결정표 검증이고, 실제 AGY exit-code·스트리밍 동작은 서버 재시작 E2E로 확인 필요.**

### 2026-07-01 E2E 상황 (사용자 실사용)

- 서버 재시작 후 실사용에서 timeout/slow-bail이 **강제 재현되지 않음**. AGY 비결정성으로 정상 한글 답변만 계속 옴. 이는 역으로 ok 버킷(정상 통과·재시도 없음, 회귀 방지)이 잘 동작한다는 방증이다.
- 사용자 결정. timeout/slow-bail 버킷은 지금 강제 재현하지 않고, **실사용 중 실제 timeout이 발생해 SCOPE_GUIDE가 정상 노출되면 그 시점에 확인 완료로 간주**한다. 그때까지 라이브 관찰 대기.
- 즉 bail 재설계(4종 + 느린 bail 가드)는 코드·단위·제어흐름 검증 완료, ok 경로 실사용 확인 완료. timeout/slow-bail 경로만 실발생 관찰 대기.

## 2026-07-01 사용자 결정 반영

- 사용자는 첫 AGY 시도가 5분 안에 정상 답변을 못 내고 timeout으로 종료되면 재시도하지 않고 질문 범위를 좁혀달라고 되묻는 방향을 승인했다.
- 구현 기준은 `code=1` timeout 실패다. 단순 wall-clock 5분 경과로 정상 응답을 중간 차단하지 않는다.
- timeout 안내는 우선 정적 문구로 처리한다. clarifier 연결은 후속 개선으로 남긴다.
- 따라서 기존 "3회 재시도" 정책은 timeout 실패에는 적용하지 않는다. 짧은 포기 문구 같은 텍스트 bail에만 별도 재시도 여부를 판단한다.
