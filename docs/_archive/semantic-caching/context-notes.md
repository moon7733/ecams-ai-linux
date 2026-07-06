# Context Notes: Semantic Caching

- 결정: 사용자가 질문 문장을 약간 변경("로그인 관련 로직 알려줘" vs "로그인 처리 흐름 알려줘")해도 캐시를 활용하여 비용과 시간을 줄이기 위해 시맨틱 캐싱을 도입한다.
- 캐시 만료 정책: 기존 24시간 유지 정책을 그대로 적용한다. 따라서 중간에 50번의 다른 질문이 오가더라도 시간 내라면 기존 답변 캐시가 발동된다.
- 임계치(Threshold): 유사도 0.95를 기본으로 설정한다. RAG 시스템에서 완전 동일 질문 여부를 판별하기에 비교적 보수적이고 안전한 수치다.

## 회귀 버그: "질문 입력 → 답변 없이 즉시 종료" (2026-06-02)

### 증상
- 시맨틱 캐싱 도입 직후, `/api/chat` 호출 시 답변 없이 즉시 끝남.
- 서버 로그.
  ```
  [Cache] No question vector generated. Skipping semantic match.
  [Chat] Adding request to queue. Message: 부재등록 ...
  [Chat] Queue job started. isAborted: true
  [Chat] Request was aborted, returning empty string.
  [Chat Success] Answer delivered.
  ```

### 진단
- `req.isAborted = true` 가 설정되는 곳은 `res.on('close')` 핸들러 **단 1곳** (server.js).
- 그 close 이벤트를 트리거할 수 있는 클라이언트 측 abort 경로도 **단 1곳** — `sendMessage()` 가 `isLoading === true` 상태에서 재호출될 때 `currentAbortController.abort()` 발동.
- 즉 시맨틱 캐싱 자체의 버그가 아니라, 시맨틱 캐싱이 추가한 `await getEmbedding(...)` 동안 클라이언트가 두 번째 `sendMessage()` 를 발화하면서 진행 중인 fetch 를 끊은 것.
- 한국어 IME 환경에서 `isComposing` 가드만으로는 더블 Enter 케이스를 100% 차단하지 못함 (브라우저별 keydown 순서 변동, IME 잔류 포커스 등).

### 결정 (수정 방향)
- **"정지" 동작은 오직 송신 버튼의 명시적 클릭으로만 가능하도록 분리**. Enter 키는 절대로 진행 중인 요청을 abort 시키지 않음.
- 구현. `public/index.html` 의 `handleKey()` 에서 `isLoading === true` 일 때 Enter 이벤트를 early-return.

### 진단 로그 (재발 대비)
- 클라이언트. `sendMessage()` 의 abort 분기 진입 시 `[sendMessage] called while loading — aborting in-flight request (stop button)` 콘솔 출력. 향후 abort 가 다시 발생하면 버튼 더블클릭 등 다른 트리거인지 즉시 확인 가능.
- 서버. `res.on('close')` 가 `writableEnded=false` 로 발화하면 `[Abort Debug] res 'close' fired before res.end(). headersSent=... hasProcess=... msg="..."` 출력. 클라이언트 외 원인(Node.js/keep-alive/프록시 등)으로 끊겼는지 1줄로 확인 가능.

### 관련 파일
- [server.js:2046-2061](../../server.js) — `res.on('close')` 핸들러 + 진단 로그.
- [public/index.html:3590-3600](../../public/index.html) — `handleKey()` early-return.
- [public/index.html:3284](../../public/index.html) — `sendMessage()` abort 분기 진단 로그.
