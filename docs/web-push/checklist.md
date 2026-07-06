# Checklist

## A. 사전 조사
- [x] `docs/web-push/plan.md` 작성
- [x] `docs/web-push/checklist.md` 작성 (이 파일)
- [x] `docs/web-push/context-notes.md` 작성
- [x] 사용자에게 핵심 결정 4가지 확인 — 권한 타이밍=첫 질문 / 푸시 조건=서버 SSE 0 / 알림=제목 40자+본문 고정 / 거부 후=영구 + 사이드바 토글로 재활성화 (결정 5/9/10)

## B. 서버 구현

### B1. 인프라
- [ ] `.gitignore` 에 `.vapid.json`, `pushSubscriptions.json` 추가
- [ ] `npm install web-push` (의존성 추가)
- [ ] `pushManager.js` 신규 — VAPID 키 lazy 생성/로딩, subscription Map + JSON 영속화

### B2. 엔드포인트 3개
- [ ] `GET /api/push/vapid-key` — publicKey 만 반환 (auth 불필요)
- [ ] `POST /api/push/subscribe` — body `{ endpoint, keys }` → userId 와 함께 저장, 동일 endpoint 중복 시 lastSeenAt 업데이트
- [ ] `POST /api/push/unsubscribe` — body `{ endpoint }` → 해당 userId 의 subscription 제거

### B3. 푸시 트리거
- [ ] `jobsManager.finishJob` 또는 `runChatJob` 완료 직후 — `subscribers.size === 0` 인 경우만 `pushManager.notifyJobComplete(userId, jobId, chatId, originalText)` 호출
- [ ] 페이로드. `{ type: 'job-complete', jobId, chatId, title: originalText 첫 40자, body: '답변이 완료되었습니다' }`
- [ ] `web-push.sendNotification` 실패 시 — `410 Gone` / `404` → 해당 subscription 자동 삭제, 그 외 에러는 로그만

## C. 클라이언트 구현 (public/index.html + public/sw.js)

### C1. 권한 요청 UX
- [ ] 첫 질문 보낼 때 (sendMessage 진입 직후) — Notification.permission 체크
- [ ] 권한 미요청 (`default`) → 컨텍스트 설명 모달 1초 후 표시 ("답변 완료시 알림을 보내드릴까요?") → 확인 시 `Notification.requestPermission` (결정 9)
- [ ] 권한 거부 (`denied`) → 모달 다시 안 띄움 (영구). 사용자 능동 재활성화는 C5 의 사이드바 토글로만 (결정 5)
- [ ] 권한 허용 (`granted`) → 즉시 subscribe 흐름 (C2)
- [ ] 모달 표시 여부 영속화 — localStorage 의 `pushModalShown: '1'` 로 중복 방지

### C2. Subscribe 흐름
- [ ] `GET /api/push/vapid-key` 로 publicKey 받기
- [ ] `navigator.serviceWorker.ready` → `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(pub) })`
- [ ] subscription 결과를 `POST /api/push/subscribe` 로 서버에 전달
- [ ] localStorage 에 `pushSubscribed: true` 캐시 (재요청 회피)

### C3. SW push / notificationclick 핸들러
- [ ] `public/sw.js` 에 `self.addEventListener('push', ...)` — 페이로드 파싱 → `self.registration.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { jobId, chatId }, tag: jobId })`
- [ ] `tag: jobId` 로 동일 job 의 알림 중복 방지
- [ ] `self.addEventListener('notificationclick', ...)` — 기존 윈도우 focus + `postMessage({ resumeJob: jobId })`, 없으면 `clients.openWindow('/?resumeJob=' + jobId)`

### C4. resumeJob 쿼리 처리 (init resume 보강)
- [ ] `init()` 의 activeJob 복구 분기 위로 — `?resumeJob=<id>` 쿼리 우선 처리. activeJob 과 다르면 server 의 `GET /api/chat/jobs/:jobId` 메타 폴링으로 chatId 추출 → loadChat → streamJobAnswer(isResume=true)
- [ ] window message 리스너 — SW 가 보낸 `{ resumeJob }` 받으면 동일 흐름 (PWA 가 이미 열려있는 경우)

### C5. 알림 토글 UI (결정 5 의 능동 재활성화 경로)
- [ ] 사이드바 하단에 "🔔 알림" 토글 행 — 모바일/데스크탑 모두 항상 보임
- [ ] 상태 3종 표시. (a) `granted` + subscribed → "켜짐", (b) `default` 또는 `granted` 미구독 → "꺼짐", (c) `denied` → "차단됨"
- [ ] 켜짐 → 끄기. `pushManager.getSubscription` → `unsubscribe` + `POST /api/push/unsubscribe`
- [ ] 꺼짐 → 켜기. permission 이 `default` 면 `requestPermission` 직접 호출 (모달 없이), `granted` 면 바로 subscribe
- [ ] 차단됨 → 켜기. "브라우저 설정 → 사이트 권한 → 알림 허용" 안내 모달 (path 안내 단계별)

## D. 테스트
- [ ] 데스크탑 Chrome — 권한 요청 모달 → 허용 → subscribe 성공 → 다른 탭으로 이동 → 답변 완료 시 알림 도착
- [ ] 데스크탑 Chrome — 권한 거부 → 24시간 cooldown 적용 확인
- [ ] 안드 PWA — 첫 질문 후 모달 → 허용 → 홈 버튼 → 답변 완료 시 시스템 알림 → 탭 → PWA 열리고 답변 표시
- [ ] iOS PWA (Safari 16.4+, 홈 화면 설치) — 동일 시나리오 (불안정 가능, 기대치 낮춤)
- [ ] 동일 사용자 PC + 폰 모두 알림 수신
- [ ] 사용자가 PWA 보고있는 상태에선 알림 안 옴 (subscribers.size > 0 분기)
- [ ] subscription `410 Gone` 시 자동 제거 (수동 endpoint 무효화 후 push 재시도)

## E. 마무리
- [ ] 사용자 OK 시 commit
