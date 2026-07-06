# Plan - AGY bail 자동 재시도

## 배경

AGY(Antigravity)는 비결정적이라 같은 질문에도 가끔 **bail**한다 — 분석을 끝내지 않고 "I am waiting for the background search to complete..." 같은 짧은 영문 placeholder 만 내고 종료(code=0, cleanLen 100~120). 실측상 1·2차 실패 후 3차에 정상 답변(cleanLen 2400+)이 오는 패턴.

그림자 격리 도입 전에는 bail 해도 AGY 가 파일을 수정해버려 "결과물"이 남았는데, 이제 격리로 수정이 무효화되니 bail 시 사용자에게 빈약한 텍스트만 보인다. → bail 을 감지해 **AGY 를 자동 재시도**한다 (사용자 선택: claude 폴백 아님, AGY 그대로 재시도).

## 설계

1. `isAgyBail(answer)` — bail 감지. 기준.
   - 답변이 비었거나 매우 짧음(< 200자). 정상 답변은 분석 템플릿(섹션 0~6 + 추천질문) 때문에 항상 길다.
   - 또는 bail 특유 문구 포함: "waiting for", "timed out waiting", "will proceed with the analysis", "search to complete".
2. `runAgyWithRetry(prompt, ...)` — runAgyStream 을 bail 아닐 때까지 최대 3회 호출.
   - 각 시도 사이 status 스트리밍("⚠️ 응답 불완전 — 재시도 N/3...").
   - 3회 모두 bail 시 안내 메시지 스트리밍.
3. `runAgyOnce`: bail 답변은 **스트리밍하지 않음**(res.write 억제) → 실패 시도의 garbage 가 사용자에게 안 보이고, 성공 시도 답변만 노출.
4. AGY 분기(runChatJob): `runAgyStream` 직접 호출 → `runAgyWithRetry` 로 교체. 이미지 2-stage 경로도 동일 적용.

## 성공 기준

- [V1] bail 답변(짧은 영문 placeholder) → 자동 재시도 → 정상 답변이 오면 그것만 사용자에게 노출.
- [V2] 정상 답변(첫 시도 성공) → 재시도 없이 즉시 반환(불필요한 지연 없음).
- [V3] 3회 모두 bail → 안내 메시지(빈 화면 방지).
- [V4] 격리는 그대로 — 어느 시도든 원본 파일 미수정.

## 트레이드오프

재시도는 지연 누적(typical bail 은 35~45s 라 3회 ≈ 2~3분). 진짜 hang(드묾)은 print-timeout 5m × 3 까지 길어질 수 있음 — 필요 시 maxAttempts 조정.

---

## 2026-07-01 개정 구현안 (Codex-Claude 합의 반영)

### 왜 개정하나

기존 `isAgyBail(answer)`는 텍스트만 보고 exitCode를 무시한다. 그래서 `--print-timeout 5m`에 걸려 `exitCode=1`로 죽은 **3125자 영문 계획 출력**이 `>300자 → 정상` 단락을 통과했다. 실측(`logs/agy_debug.log`, `code=1 elapsed=304.8s cleanLen=3125`). 이 답이 재시도·스트리밍 억제·에러표시 세 그물을 모두 빠져나가, 사용자가 5분 기다린 뒤 영문 garbage를 최종 답변(`/api/chat` 2706 `done` 이벤트)으로 받았다.

### 결과 3분류 (ok / timeout / text-bail)

핵심은 **exitCode + 한글 유무**를 판정에 넣고, timeout과 텍스트 bail을 **다르게** 처리하는 것이다.

- `ok` — exitCode 0, 한글 포함, 충분한 길이. 그대로 스트리밍·반환.
- `timeout` — exitCode ≠ 0 (백그라운드 검색 5분 초과 등). **재시도하지 않고** 정적 안내 반환 (사용자 승인).
- `text-bail` — exitCode 0 이지만 한글 없음 / 200자 미만 / 200~300자에 포기 문구. AGY 비결정성 → 기존 nudge 재시도 유지.

### 변경 1 — `isAgyBail(answer, exitCode)` 확장 (server.js:1977)

`exitCode` 인자를 받고, 한글 유무 검사를 `>300` 단락 **앞으로** 옮긴다. 이 순서가 timeout garbage를 막는 핵심이다.

```js
function isAgyBail(answer, exitCode = 0) {
  if (exitCode !== 0) return true;              // process 실패(timeout 등)는 길이 무관 bail
  if (!answer) return true;
  const a = answer.trim();
  if (!/[가-힣]/.test(a)) return true;           // 한글 전무 = 영문 계획만 흘림
  if (a.length < 200) return true;
  if (a.length > 300) return false;              // 한글 있고 300자 초과 = 정상 (이제 안전)
  const lower = a.toLowerCase();
  return ['waiting for', 'timed out waiting', 'will proceed with the analysis', 'search to complete', 'once the search']
    .some(m => lower.includes(m));
}
```

### 변경 2 — `runAgyOnce` onExit: bailType 계산 (server.js:2077)

```js
const bail = isAgyBail(clean, exitCode);
state.bailType = exitCode !== 0 ? 'timeout' : (bail ? 'text-bail' : 'ok');
if (!bail) {
  res.write('data: ' + JSON.stringify({ type: 'text', text: clean }) + '\n\n'); // 정상만 스트리밍
} else if (exitCode !== 0) {
  state.errorMsg = `agy exit code ${exitCode}`;
}
```

`logAgy` EXIT 라인에 `bailType=${state.bailType}` 추가 (유형 분포 계측).

### 변경 3 — `runAgyStream` 반환에 code·bailType 포함 (server.js:2120~2121)

현재 `resolve(state.answer.trim())` (문자열만) → exitCode가 상위에서 소실된다. 확장한다.

```js
resolve({ answer: state.answer.trim(), code, bailType: state.bailType });
```

이 함수의 유일한 호출자는 `runAgyWithRetry`(2135) 하나라 파급이 없다. 아울러 기존 2114~2118의 `code!==0 && !state.answer` 에러 텍스트 `res.write`는 **제거**한다. timeout 안내를 `runAgyWithRetry`가 전담하므로 중복·이중출력을 막는다. `elapsed` 이벤트(2120)는 유지.

### 변경 4 — `runAgyWithRetry`: code 우선 분기, 두 버킷 분리 (server.js:2127)

**주의(구조적 함정).** `runAgyOnce`의 early-resolve 경로(write-fail 2027, spawn-fail 2056)는 `onExit` 전에 `resolve({ code: -1, state })` 하므로 `state.bailType`이 **세팅되지 않는다(undefined)**. 따라서 `bailType`으로만 분기하면 인프라 실패(code=-1)가 text-bail로 흘러 3회 무의미 재시도되고 에러 메시지도 사라진다. 이걸 막으려면 `code`를 직접 분기하고 **버킷을 둘로** 나눈다.

- `code === -1` — agy가 아예 안 떴다(spawn/write 실패). "좁혀달라"는 오해를 준다 → 인프라 에러 문구.
- `code !== 0` (그 외 비정상 종료, timeout 포함) — agy는 돌았으나 완결 실패 → "질문을 좁혀달라" 안내.
- `code === 0` — bailType으로 ok / text-bail 구분.

```js
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  let currentPrompt = prompt;
  if (attempt > 1) currentPrompt = NUDGE + prompt;   // 기존 nudge (text-bail 재시도용)
  const { answer, code, bailType } = await runAgyStream(currentPrompt, res, allowedRepos, overallStartTime, req);

  if (code === -1) {                                 // 버킷 A: 인프라 실패(엔진 미기동)
    const errMsg = '⚠️ 분석 엔진을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    res.write('data: ' + JSON.stringify({ type: 'text', text: errMsg }) + '\n\n');
    return errMsg;
  }
  if (code !== 0) {                                  // 버킷 B: timeout 등 비정상 종료 (재시도 안 함, 사용자 승인)
    const guide = '⚠️ 질문 범위가 넓어 5분 안에 분석을 마치지 못했습니다. 특정 화면이나 파일, 기능으로 질문을 좁혀서 다시 물어봐 주세요.';
    res.write('data: ' + JSON.stringify({ type: 'text', text: guide }) + '\n\n');
    return guide;
  }
  if (bailType === 'ok') return answer;              // 정상 (code===0)

  // code===0 && text-bail → 재시도 (AGY 비결정성 대응)
  if (attempt < maxAttempts) appendChunk(jobId, ... '재시도 ' + (attempt+1) + '/' + maxAttempts ...);
}
// text-bail 3회 → 기존 giveUp 문구
```

두 안내 문구(`errMsg`, `guide`) 모두 60자대라 `isCompleteAnswer`(2717, `##`+2000자) 캐시, `answerLogger`(2710, >100자), `pendingFeedback`(>100자) 어디에도 안 걸린다. 오답 캐시·로그 오염 없음.

**미해결(carry forward).** `decisions.md`는 text-bail 재시도 여부를 별도 판단으로 열어뒀다. 이 구현안은 기존 `maxAttempts=3`을 그대로 유지하되, 이는 확정이 아니라 "3회 유지, 확정 보류" 상태다. 로그 16건에 text-bail이 거의 없어(유일 실패는 timeout) 저위험이라 이월한다.

### 이 개정으로 닫히는 것

- timeout garbage가 최종 답변으로 노출되던 경로 → `timeout` 분류 + 정적 안내로 차단.
- 300자 초과 영문 출력의 `isAgyBail` 오판 → 한글 검사 선행으로 제거.
- timeout에 무의미한 nudge 재시도(최악 15분) → timeout은 재시도 0회.

### 검증 기준

- **단위** — `isAgyBail` 케이스표. (code=1, 영문 3125자)→true / (code=0, 한글 2500자)→false / (code=0, 한글없음 3125자)→true / (code=0, 117자)→true / (code=0, 한글 3772자=292초급)→false(회귀 방지).
- **제어흐름** — `runAgyWithRetry` 분기. code=-1(빈 답변)→인프라 에러 문구·재시도 0회 / code=1→좁혀달라 안내·재시도 0회 / code=0+text-bail→재시도 발동 / code=0+ok→즉시 반환. (isAgyBail 텍스트 케이스표로는 이 경로가 안 잡히므로 별도 확인.)
- **계측** — EXIT 라인 `bailType` 분포로 timeout·text-bail·ok 비율 추적.
- **E2E** — sample_db SQL 값 조회형(위 timeout 유발 유형)으로 정적 안내가 재시도 0회·1회 실행(~5분)으로 뜨는지. 정상 질문은 재시도 없이 통과.
- **회귀** — 292초급 정상 한글 답변이 여전히 `ok`로 통과하는지.

### 적용 시점 (병렬 충돌 회피)

bail 함수(1977~2145)와 Codex의 dead path(runDeepSeekStream 2211~, dispatch 2655~2698, 매핑 2768)는 라인이 겹치지 않는다. 다만 같은 `server.js`라 동시 편집은 머지 위험이 있다. **Codex의 dead path 제거 커밋이 끝난 뒤** 이 4개 변경을 하나의 논리 커밋으로 적용한다. 적용 후 `node --check server.js` + 서버 재시작 + 위 E2E.
