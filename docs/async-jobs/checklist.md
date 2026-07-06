# Checklist

## A. 사전 조사 (구현 진입 전)

- [x] `docs/async-jobs/plan.md` 작성
- [x] `docs/async-jobs/checklist.md` 작성 (이 파일)
- [x] `docs/async-jobs/context-notes.md` 작성
- [x] [server.js](../../server.js) 의 모델 라우터 전체 흐름 파악 (gemini/agy/claude/sonnet/haiku/deepseek 각 분기 위치 + `req.currentProcess` 할당 패턴)
- [x] `run*Once` / `run*Stream` 함수들의 `res.*` 호출 패턴 grep — fake res 가 hook 해야 할 메서드 목록 확정 (run* 함수는 `write` 만 사용, 나머지는 핸들러에서 직접)
- [x] `req.isAborted` 체크 분기 위치 grep (queue 콜백 내부만. `getJobStatus(jobId) === 'cancelled'` 로 교체)

## B. 서버 구현

### B1. jobs 인프라
- [x] `jobs` 메모리 Map + 헬퍼 모듈 → 별도 `jobsManager.js` 로 분리
  - `createJob(userId)` → `jobId` (uuid v4)
  - `getJob(jobId, userId)` → 권한 검증 포함, 없으면 null
  - `appendChunk(jobId, rawLine)` → chunks 누적 + 구독자에게 broadcast
  - `finishJob(jobId, finalAnswer)` / `failJob(jobId, errText)` / `cancelJob(jobId)`
  - `subscribe(jobId, sseRes)` / `unsubscribe(jobId, sseRes)`
- [x] TTL/cleanup `setInterval` (60s 주기) — completed +30분 / idle +5분 제거
- [x] 동일 사용자 동시 진행 중 job 개수 카운트 헬퍼 (3개 제한)

### B2. `/api/chat` 변경
- [x] 캐시 hit 경로 — exact match: `res.json({ type:'cached', answer, chatId })` 즉시 반환
- [x] LLM 호출 경로 — `jobId` 발급 → `res.json({ type:'job', jobId })` → `setImmediate(() => runChatJob(...))`
- [x] `res.on('close')` 핸들러 제거 (백그라운드 계속 유지, 결정 4)
- [x] 동시 job 제한 초과 시 `429` 반환

### B3. fake res/req 도입
- [x] `createFakeRes(jobId)` — `write(chunk)` → `appendChunk`, `setHeader`/`end` → no-op
- [x] `createFakeReq(jobId)` — `currentProcess` setter → `setCurrentProcess(jobId, p)`
- [x] `runChatJob` 에서 모든 `run*` 함수 호출 시 fakeRes/fakeReq 주입 (시그니처 무변경)
- [x] `agy` 의 `node-pty` 경로: `term.onData` 콜백 안에서 `res.write` 호출 → fakeRes 정상 캡처 확인 (클로저 참조)

### B4. 새 엔드포인트 3개
- [x] `GET /api/chat/jobs/:jobId/stream` — SSE, 누적 flush + live 구독, `X-Accel-Buffering: no`
- [x] `POST /api/chat/jobs/:jobId/cancel` — 권한 검증 + `cancelJob`
- [x] `GET /api/chat/jobs/:jobId` — 메타 폴링 (status/startedAt/completedAt/chunkCount/finalAnswer)

## C. 클라이언트 구현 ([public/index.html](../../public/index.html))

### C1. 채팅 전송 흐름 변경
- [x] 기존 SSE streaming reader 흐름 → JSON 응답 파싱 (`type: 'cached'` | `type: 'job'`)
- [x] `type: 'job'` → `readJobStream(jobId)` — fetch Authorization 헤더 포함 스트림 구독
- [x] `handleSseData` 내부 함수 — 기존 chunk handler 재사용 (status/text/elapsed/done/error)

### C2. localStorage 활성 job 관리
- [x] 채팅 전송 시 `localStorage.setItem('activeJob', JSON.stringify({jobId}))`
- [x] 완료/cancel 시 `localStorage.removeItem('activeJob')`
- [x] activeJob 풀 컨텍스트 저장 — `{ jobId, chatId, usedModel, originalText, selectedReposArray, fastMode, startedAt }` (결정 15)
- [x] 페이지 로드 init 시 `activeJob` 검사 → 자동 재구독 (결정 13)

### C5. PWA 강제종료 → 재실행 자동 복구 (2026-06-04 추가, 결정 13~16)
- [x] `sendMessage` 진입 직후 chatId 발급 + `saveChat(placeholderTitle)` 즉시 호출 — 답변 완료 전 강제종료돼도 질문은 chatHistory 에 영속화
- [x] SSE 처리부를 `streamJobAnswer(ctx)` 헬퍼로 추출 — sendMessage 첫 전송 / init resume 두 경로 공유 (결정 14)
- [x] `init()` 에 activeJob 자동 복구 — loadChat → streamJobAnswer (isResume: true)
- [x] resume 시 statusEl 에 "재연결 중..." 안내
- [x] `showReconnectButton(loadingEl, ctx)` — readJobStream 무한 retry 가 throw 한 경우 (404/401 외) 재연결 버튼 표시, activeJob 유지 (결정 16)
- [x] 404/401 (서버에서 job 사라짐) → 명시적 안내 + activeJob 삭제

### C3. visibility 복구
- [x] `document.addEventListener('visibilitychange', ...)` — hidden→visible 전환 시 `resubscribeCallback` 호출
- [x] 재구독: fullAnswer/answerBubble reset → `readJobStream` 재호출 (처음부터 재전송, 결정 11)
- [x] 마지막 chunk index 추적 미포함 (v1: 처음부터 재전송. v2 에서 `?since=N` 도입 검토)

### C4. 정지 버튼 (결정 4 교체)
- [x] `AbortController.abort()` → `fetch('/api/chat/jobs/'+jobId+'/cancel', {method:'POST'})` + `currentStreamAbort.abort()`
- [x] finally 블록에서 `currentJobId`/`currentStreamAbort`/`resubscribeCallback` 초기화

## D. 테스트

- [ ] 데스크탑 회귀 — 정지 버튼 정상 동작
- [ ] 데스크탑 새로고침 후 진행 중 job 자동 복구
- [ ] 시맨틱 캐시 hit (결정 25) 경로 회귀 없음 — jobId 없이 즉시 응답
- [ ] 이미지 첨부 (결정 28) 회귀 없음 — 첫 POST 에 image base64 전달, SSE 로 답변 정상 수신
- [ ] 모바일 Chrome 백그라운드 30초/3분/5분 후 복구
- [ ] 모바일 삼성 인터넷 동일 시나리오
- [ ] 동일 사용자 동시 job 4개째 → 429 거부
- [ ] 동일 사용자 다른 jobId 요청 → 권한 검증 동작 (다른 user 의 jobId 로 stream/cancel 시 404)

## E. 마무리

- [ ] (선택) 사용자 OK 시 git commit (논리 단위 분할 — "Job 기반 비동기 답변 인프라" + "클라이언트 SSE 재구독" 2개)
