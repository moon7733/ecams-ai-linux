# Context Notes — 결정 근거 / 검증 결과

작업하면서 내린 결정과 그 이유. 다음 세션이 재구성 없이 이어갈 수 있도록 누적.

---

## 2026-06-02 — 초기 결정

### 결정 1. 일반 메신저/ChatGPT 패턴 채택 (서버 first + 로컬 캐시 + 푸시) — 2026-06-02

**배경**: 사용자 보고 — 모바일에서 질문 보내고 홈 버튼 → 다른 앱 → 돌아오면 답변이 끊김. 원인 추적 결과 [server.js:2065-2080](../../server.js#L2065-L2080) 의 `res.on('close')` 가 클라이언트 fetch 끊김을 자식 프로세스 `kill()` 트리거로 사용 중 (결정 26 Stop 로직). 모바일 백그라운드 = fetch 끊김 = 답변 abort.
**대안 (탈락 1)**: 로컬 저장공간만 확장. 끊긴 답변이 클라이언트에 도착도 안 했으니 저장할 내용 자체가 없음.
**대안 (탈락 2)**: 네이티브 앱 전환. iOS Live Activities 같은 일부 영역 빼면 모바일 OS 의 백그라운드 freeze 는 네이티브도 동일 → 본질적 해결 아님. ROI 안 맞음.
**선택**: 카톡/슬랙/ChatGPT 와 동일 패턴. 서버가 진실의 원천. 답변을 서버 측에서 끝까지 생성 + 영속화. 클라이언트는 단순 viewer + 재구독.
**파급**: 정지 버튼의 trigger 가 fetch abort 에서 명시적 API 호출로 바뀜 (결정 4 참고). 결정 26 의 의도 (사용자가 멈추고 싶을 때 즉시 차단) 는 그대로 보존.

### 결정 2. jobId 기반 미니멀 영속화 (메모리, TTL) — 2026-06-02

**선택**: 진행 중인 답변만 메모리 `Map<jobId, jobState>` 에 저장. 완료 후 30분, idle (재구독 없음) 5분 TTL.
**대안 (탈락 1)**: conversation/message 전체를 서버 DB 영속화 (일반 메신저처럼). 대공사. 본 feature 의 미니멀 범위 초과.
**대안 (탈락 2)**: SQLite/Redis 도입. 별도 인프라 + 의존성. node-pty 처럼 native 빌드 또 한 칸 추가.
**이유**: 본 feature 의 목표 = "백그라운드 갔다 와도 답변 살아있음" 만 충족하면 됨. 영구 conversation 관리는 별도 작업으로 분리. 메모리 + TTL 이 가장 가볍고 회귀 위험 낮음. 서버 재기동 시 진행 중 jobs 증발은 의도된 제약 (재기동 자체가 드물고, 발생 시 사용자가 다시 보내면 됨).

### 결정 3. `/api/chat` 흐름 변경 — jobId 발급 + 백그라운드 생성 — 2026-06-02

**기존**: `/api/chat` POST → SSE 헤더 → LLM stream → 클라이언트 직접 수신. fetch 끊기면 kill.
**변경**: `/api/chat` POST → 캐시 미스면 jobId 발급 후 즉시 `200 OK { jobId }` 반환. LLM 호출은 `setImmediate(() => runLlm(...))` 로 백그라운드 시작.
**새 엔드포인트 3개**.
- `GET /api/chat/jobs/:jobId/stream` — SSE 구독 (재구독 가능)
- `POST /api/chat/jobs/:jobId/cancel` — 명시적 Stop
- `GET /api/chat/jobs/:jobId` — 메타 폴링 (선택, SSE 미지원 환경 대비)

### 결정 4. 정지 버튼 의미 분리 — fetch abort → 명시적 cancel API — 2026-06-02

**기존 (결정 26)**: 정지 버튼 = `AbortController.abort()` → `res.on('close')` → `currentProcess.kill()`.
**변경**: 정지 버튼 = `POST /api/chat/jobs/:jobId/cancel` → 서버 측 `cancelJob` 호출 → `currentProcess.kill()`.
**이유**: 백그라운드 가서 fetch 끊김 ≠ 사용자 명시적 Stop. 둘 구분 안 하면 백그라운드 갈 때마다 답변 죽음 (현 증상). 결정 26 의 의도 (사용자가 멈추고 싶을 때 즉시 차단 + 토큰/비용 절약) 는 cancel API 로 그대로 보존, trigger 방식만 변경.

### 결정 5. 권한 — jobId 가로채기 방지 — 2026-06-02

**위협**: user A 의 jobId 를 user B 가 알면 답변 가로채기 가능. LLM 답변에 권한별 민감 정보 가능 (예: 사용자 A 의 admin 권한 레포 답변을 user B 가 stream 으로 받음).
**선택**:
- `createJob` 시 `jobs[jobId].userId = req.user.id` 바인딩.
- 재구독/cancel/메타 조회 요청마다 `jobs[jobId].userId === req.user.id` 검증.
- 다르면 404 (존재 자체 은닉) — 401/403 은 jobId 존재 자체를 알려주므로 enumerate 공격 단서.
- jobId 는 `crypto.randomUUID()` (uuid v4) → 추측 불가.

### 결정 6. 메모리 누적 위험 + 제한 — 2026-06-02

**위험**: jobs Map 에 chunks 무한 누적 시 OOM. 특히 동시 사용자 다수 + 긴 답변.
**1차 방어**: 동일 사용자 동시 진행 중 job 3개 제한. 초과 시 429 반환. 사용자가 답변 안 기다리고 연속으로 던지는 패턴 차단.
**2차 방어 (TTL)**: completed → 30분, idle (재구독 없음) → 5분 후 auto-cancel + cleanup. `setInterval(cleanup, 60_000)`.
**미해결 (3차)**: 한 답변의 chunks 크기 cap 없음. 평균 LLM 응답 50~500KB 라 일단 미체크. 추후 streaming 중 size 한도 (예: 5MB) 추가 검토. 한 답변이 5MB 넘으면 보통 LLM 버그.

### 결정 7. 모든 모델 분기에 jobId 흐름 통합 — fake res 객체 — 2026-06-02

**현황**: [server.js](../../server.js) 안에 `runGeminiOnce`, `runGeminiStream`, `runAgyOnce`, `runAgyStream`, `runClaudeStream`, `runDeepseekStream` 등 각 모델별 함수가 `res.write(...)` 를 직접 호출하는 패턴. 시그니처 변경 시 6+ 함수 + 호출처 모두 손봐야 함.
**선택**: fake res 객체 도입. `createFakeRes(jobId)` 가 `write`/`end`/`setHeader` 등을 hook 해서 내부적으로 `jobs[jobId].appendChunk(...)` 로 routing. 기존 함수 시그니처 무변경 → 회귀 면적 최소.
**대안 (탈락)**: 각 `run*` 함수의 res 인자를 callback emitter 로 교체. 시그니처 전부 깨짐. 호출처마다 수정. 회귀 위험.
**검증 필요 사항** (구현 시).
- `res.*` 호출 패턴 grep 으로 hook 해야 할 메서드 전수 파악 (`write`, `end`, `setHeader`, `flushHeaders`, `writable`, `headersSent` 등).
- `agy` 의 `node-pty` 경로는 `term.onData` 콜백 안에서 res 호출 → 콜백 클로저 안에 fake res 가 잘 캡처되는지 확인.

### 결정 8. 캐시 hit 경로는 jobId 없이 즉시 응답 유지 — 2026-06-02

**선택**: [server.js:2117](../../server.js#L2117) 부근의 `answerCache.get` + semantic cache hit 케이스 (결정 25) 는 기존 흐름 그대로. 즉시 답변 반환. jobId 발급 안 함.
**이유**: 캐시 hit 는 ms 단위 즉시 응답 → jobId/SSE 오버헤드 불필요. 클라이언트도 fetch 응답이 `{ jobId }` 인지 `{ answer }` 인지 분기해서 처리. LLM 실제 호출 케이스만 jobId 흐름으로.

### 결정 9. 푸시 알림 (B 옵션) 은 별도 feature — 2026-06-02

**선택**: 이번 작업 (A) 은 "백그라운드 갔다 와서 다시 열면 답이 살아있음" 만 다룸. 푸시 알림으로 "답변 완료" 통보는 후속 별도 feature (`docs/web-push/` 예정).
**이유**:
- AGENTS.md §9 semantic commits. 단일 논리 단위 분할.
- B 는 VAPID 키 + iOS PWA 설치 의존 + `web-push` 패키지 추가. A 와 독립적으로 테스트/배포 가능해야 회귀 추적 쉬움.
- A 만으로도 사용자 경험 큰 개선 (앱 다시 열면 답이 있음 = ChatGPT 앱 수준 동작).

### 결정 10. SSE buffering 회피 — `X-Accel-Buffering: no` — 2026-06-02

**위협**: Cloudflare Tunnel + 기본 SSE 응답이 프록시 buffer 에 막혀 chunk 단위 streaming 안 되고 일정량 누적 후 한 번에 도착하는 현상 가능.
**선택**: `/api/chat/jobs/:jobId/stream` 응답 헤더에 `X-Accel-Buffering: no` 추가. nginx/Cloudflare 가 인식.
**참고**: 기존 `/api/chat` SSE 가 잘 streaming 됐던 걸 보면 Cloudflare 가 이미 SSE Content-Type 으로 인식해서 buffer 안 하는 듯. 그래도 명시적으로 박는 게 안전.

### 결정 11. 클라이언트 재구독은 단순 "처음부터 다시" (v1) — 2026-06-02

**선택**: visibility 복구 / 새로고침 재구독 시 서버는 누적된 chunks 전체를 처음부터 다시 보냄. 클라이언트는 받는 대로 화면 재구성.
**대안 (탈락)**: `?since=N` 쿼리로 N번째 chunk 부터만 전송. 인덱스 관리 복잡 + 클라이언트가 lastSeenIdx 추적 + 서버가 chunks 배열 인덱싱.
**이유**: v1 미니멀. LLM 답변 평균 크기 작아서 처음부터 다시 보내도 수십 KB. 모바일 LTE 도 즉시. 인덱스 동기화 버그 위험 회피. v2 에서 필요 시 도입.

### 결정 12. 결정 28 (이미지 첨부) 호환 — 첫 POST 1회 처리, 재구독 시 image 페이로드 없음 — 2026-06-02

**시나리오**: 사용자가 이미지 첨부 후 질문 → 첫 POST 에 base64 image. 서버는 image 처리해서 LLM 에 전달 → 답변 chunks 생성. 사용자 백그라운드 → 돌아옴 → 재구독.
**선택**: 첫 POST 의 image 처리는 기존과 동일. 재구독 (`GET /api/chat/jobs/:jobId/stream`) 은 image 페이로드 없음 — 서버가 이미 처리 완료, 답변 chunks 만 stream 으로 흘려보냄.
**클라이언트 표시**: 결정 28 의 `appendMessageDOM(role, content, image)` 그대로. image 는 localStorage 에 이미 저장됨 (재구독 시 굳이 다시 전송 불필요).

---

## 2026-06-04 — PWA 강제종료 → 재실행 자동 복구 (옵션 B)

### 결정 13. PWA 강제종료 시나리오 — 풀 자동 복구 채택 — 2026-06-04

**배경**. PWA 설치 후 검증 결과 (1) 짧은 백그라운드 (2) 장시간 백그라운드 두 시나리오는 visibilitychange + SSE 재구독으로 정상 동작. 그러나 사용자가 **PWA 를 백그라운드에서 강제 종료 (스와이프 제거)** 후 재실행하면. 새 대화창만 뜨고 질문조차 안 보임.
**원인**. (a) `saveChat()` 가 답변 완료 후에만 호출 → 강제종료 시점에 질문 미저장. (b) `localStorage.activeJob` 이 `{ jobId }` 만 저장 → 어느 chat 인지 모름. (c) `init()` 이 activeJob 자체를 안 봄.
**대안 (탈락 A). 미니멀**. 질문만 즉시 저장 + init 에서 loadChat 만. 질문은 보이나 답변은 사라짐. 사용자가 다시 질문 → 토큰 2회 소비. UX 부족.
**선택**. 풀 자동 복구. 질문 즉시 저장 + activeJob 풍부 저장 + init 에서 자동 재구독.
**파급**. 이 작업이 사실상 [docs/async-jobs/plan.md:43-45](../async-jobs/plan.md#L43-L45) 의 "페이지 로드 시 복구" 항목 (계획에 있었으나 미구현) 완성. 이후 Push 도입 시 "알림 탭 → 앱 열림 → 답변 자동 표시" 흐름도 본 결정 위에서 재사용.

### 결정 14. SSE 처리부를 `streamJobAnswer` 헬퍼로 추출 — 2026-06-04

**선택**. `sendMessage` 내부의 ~230줄 SSE 처리 (loading bubble + handleSseData + readJobStream + visibility 재구독) 를 top-level `streamJobAnswer(ctx)` 헬퍼로 추출. `sendMessage` 와 `init resume` 두 경로 공유.
**ctx 시그니처**. `{ jobId, chatId, usedModel, originalText, originalImageDataUrl, isResume }`. `originalText` 는 feedback 매핑/saveChat 제목에 사용.
**대안 (탈락)**. init resume 만을 위한 별도 미니 SSE 처리. 코드 중복 + handleSseData 로직 불일치 위험.

### 결정 15. activeJob 풀 컨텍스트 저장 — Q1=(b) — 2026-06-04

**저장 필드**. `{ jobId, chatId, usedModel, originalText, selectedReposArray, fastMode, startedAt }`.
**이유**. (a) `usedModel` 없으면 elapsed 배지의 모델 라벨 표시 불가 (서버 `elapsed`/`done` 이벤트엔 모델 정보 없음 — server.js 1492/1524/2128/2223 확인 완료). (b) `originalText` 는 saveChat 제목 + feedback `question` 필드용. (c) `selectedReposArray` 는 feedback `repos` 필드 정확 복원 — 사용자가 resume 시점에 sidebar 의 selectedRepos 를 바꿔놨을 수 있음. (d) `fastMode` 는 완전성 차원 (현재 표시 로직엔 직접 사용 안 함, 향후 UI 복원에 활용 가능). (e) `startedAt` 은 디버깅 / 너무 오래된 activeJob 자동 만료용.
**제외 필드 (이미지)**. `originalImageDataUrl` 은 messages 배열 (=chatHistory localStorage) 에 이미 저장됨. activeJob 에 중복 저장 안 함. resume 시 loadChat 이 image 도 함께 복원.

### 결정 16. 자동 재구독 실패 시 — "재연결" 버튼 + activeJob 유지 — Q2=(a) — 2026-06-04

**시나리오**. PWA 재실행 → init resume → `streamJobAnswer` 호출 → fetch 가 network error / 401 / 404 등으로 실패.
**선택**. (a) activeJob 유지 + 답변 영역에 "재연결" 버튼 표시. 사용자가 누르면 같은 jobId 로 재시도.
**대안 (탈락)**. activeJob 자동 삭제 + 에러 메시지 출력. 일시적 네트워크 문제 (LTE 끊김 등) 로 영구 복구 불가 상태에 빠짐. UX 후퇴.
**TTL 안전망**. 서버 측 jobs Map TTL 이 완료 후 30분 (결정 6) → 30분 넘으면 jobId 자체가 서버에서 사라짐. 재연결 버튼 눌러도 404. 이 경우는 activeJob 삭제 + 에러 메시지 (사용자가 다시 질문해야 함). 클라이언트에서 startedAt 기준 30분 초과면 자동 삭제도 옵션 (구현은 보수적으로 후순위).
