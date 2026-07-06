# Plan — Job 기반 비동기 LLM 답변 (백그라운드 견딤)

> **연결 feature**: 결정 26 (Stop 버튼 — `agy-integration` 결정 26) 의 의미를 재정의한다. 결정 28 (첨부 이미지) 회귀 점검 포함. [`mobile-pwa/`](../mobile-pwa/) 와 독립이지만, 모바일 사용성 측면에서 둘이 합쳐져야 "앱처럼" 완성됨.

## 1. 배경 / 목적

**증상 (사용자 보고, 2026-06-02)**. 모바일에서 질문 보내고 홈 버튼 → 다른 앱 → 돌아오면 답변이 끊김.

**원인**. [server.js:2065](../../server.js#L2065) 의 `res.on('close')` 핸들러가 클라이언트 fetch 끊김을 감지하면 자식 프로세스 (`agy`/`claude`/`gemini`/`deepseek`) 를 `kill()` 함 — 결정 26 의 Stop 로직. 모바일 브라우저는 백그라운드 가면 fetch 가 끊기므로, **"백그라운드 = 사용자 Stop" 으로 동일 취급** 중. 따라서 답변 abort.

**목표**. 일반 메신저/ChatGPT 와 동일한 패턴 도입.
- **서버가 진실의 원천**. 답변을 끝까지 생성 + 영속화 (메모리, TTL)
- **클라이언트는 단순 viewer + 재구독**. fetch 끊겨도 서버는 계속, 다시 열면 jobId 로 마저 받음
- **정지 버튼 의미 분리**. fetch abort → 명시적 cancel API 로

본 feature 는 "백그라운드 갔다 와도 답이 살아있음" 만 다룸. 푸시 알림 (B 옵션) 은 별도 후속.

## 2. 작업 두 갈래

### A. 서버 측 (핵심)

목표. `/api/chat` 흐름을 jobId 기반 비동기로 전환. LLM 호출은 백그라운드에서 계속. 클라이언트 끊겨도 kill 안 함.

- **jobs 메모리 Map**. `jobId → { userId, status, repos, model, chunks[], finalAnswer, error, startedAt, completedAt, currentProcess, subscribers[] }`
- **`/api/chat` 변경**.
  - 캐시 hit (결정 25) → 기존대로 즉시 답변 (jobId 없음). 변경 없음
  - LLM 호출 케이스 → jobId 발급 + 즉시 200 OK 반환. LLM 은 `setImmediate` 로 백그라운드 시작
  - `res.on('close')` 의 `process.kill` 제거 (백그라운드 계속)
- **새 엔드포인트 3개**.
  - `GET /api/chat/jobs/:jobId/stream` — SSE 구독. 누적 chunks 즉시 flush + 이후 live append. 클라이언트 끊겨도 listener 만 제거 (답변 생성은 계속)
  - `POST /api/chat/jobs/:jobId/cancel` — 명시적 Stop. `currentProcess.kill()` + `status='cancelled'`
  - `GET /api/chat/jobs/:jobId` — 메타데이터 폴링 (선택, SSE 미지원 환경 대비)
- **권한**. createJob 시 userId 바인딩. 모든 jobs 엔드포인트에서 `jobs[jobId].userId === req.user.id` 검증. 다르면 404 (존재 자체 은닉)
- **TTL/cleanup**. 완료 후 30분, idle (재구독 없음) 5분 → auto-cancel + cleanup. setInterval 1분 주기 청소
- **동시 job 제한**. 동일 사용자 진행 중 job 3개 이하 (메모리 OOM 방어)
- **모델 분기 통합**. 기존 `runGeminiOnce`/`runAgyOnce`/`runClaudeStream` 등 함수가 `res.write` 직접 호출. fake res 객체 (write/end 메서드만 hook 해서 `jobs[jobId].appendChunk` 로 routing) 로 시그니처 무변경 — 회귀 최소화

### B. 클라이언트 측

목표. fetch 응답에서 jobId 받아 SSE 구독. visibility/새로고침 시 자동 재구독. 정지 버튼은 cancel API 호출.

- **chat 보낼 때**. fetch 응답 = `{ jobId }`. 즉시 `EventSource('/api/chat/jobs/:jobId/stream')` 으로 SSE 구독
- **`localStorage` 에 activeJob 저장**. `{ jobId, chatId, repos, model, startedAt }`. 완료/cancel/error 시 제거
- **`visibilitychange` 핸들러**. hidden→visible 전환 시 SSE `readyState` 검사. 끊겼으면 같은 jobId 로 재구독
- **페이지 로드 시 복구**. localStorage 의 activeJob 있으면 자동 재구독
- **정지 버튼 (결정 26)**. 기존 `controller.abort()` → `fetch('/api/chat/jobs/:jobId/cancel', {method:'POST'})` 로 교체
- **이미지 첨부 (결정 28)**. 첫 POST 에 base64 전송 그대로. 재구독 시엔 image 페이로드 없음 — 서버가 이미 처리 완료 (chunks 에 인코딩됨)

## 3. 성공 기준

- 모바일 (Chrome/삼성 인터넷) 에서 질문 보내고 **홈 버튼 → 다른 앱 30초/3분/5분** → 돌아오면 답변이 끊긴 부분부터 마저 표시 또는 완성된 답변 즉시 표시
- 새로고침해도 진행 중 job 자동 복구
- 정지 버튼 그대로 동작 (이제 진짜 cancel — 결정 26 의도 보존)
- 동일 사용자 동시 job 4개째 시도 → 4xx 거부
- 데스크탑 사용 회귀 없음. 캐시 hit (결정 25), 이미지 첨부 (결정 28) 회귀 없음

## 4. 위험 / 미해결

- **메모리 누적**. chunks Map 무한 누적 → OOM. 1차 방어. 동시 job 3개 제한 + TTL. 2차 방어 (이번 작업 미포함). chunks 누적 size cap.
- **서버 재기동 시 진행 중 jobs 증발**. 영속성 없음 (의도). 재기동 자체가 드물고, 발생 시 사용자가 다시 보내면 됨. 추후 SQLite/Redis 영속화는 별도 작업.
- **답변 완료 후 사용자 미복귀**. 토큰 비용은 그대로 발생. 사용자 인식 필요 (앱처럼 쓰면 어차피 발생할 비용).
- **fake res 객체의 한계**. 일부 함수가 `res.setHeader`/`res.getHeader` 등 비-write 메서드 호출 시 무시/no-op 처리 필요. 구현 시 모든 호출 패턴 grep 으로 확인.
- **agy `node-pty` 와 fake res**. node-pty 의 `term.onData` 가 직접 res 를 참조하는 게 아니라 콜백이라 영향 적을 것으로 추정. 검증 필요.
- **jobId 가로채기**. userId 바인딩으로 1차 방어. jobId 자체는 uuid v4 → 추측 불가.
- **SSE 와 Cloudflare Tunnel**. SSE 가 프록시 buffer 에 막힐 수 있음. `X-Accel-Buffering: no` 헤더 추가로 nginx/cloudflare buffer 회피.

## 5. 다음 단계

본 docs OK → 구현. 순서.
1. server.js 의 모델 분기 흐름 / `run*` 함수 시그니처 파악
2. jobs Map + 헬퍼 + 새 엔드포인트 3개 추가
3. `/api/chat` 흐름 변경 + fake res 도입
4. 클라이언트 측 SSE 구독 / 재구독 / cancel 로직
5. 데스크탑 회귀 → 모바일 실기 검증 → commit
