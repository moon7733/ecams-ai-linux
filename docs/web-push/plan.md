# Plan — Web Push 알림

> **연결 feature**. [`mobile-pwa/`](../mobile-pwa/) (PWA 설치 인프라) 위에 얹는다. [`async-jobs/`](../async-jobs/) 결정 13~16 의 "PWA 강제종료 → 재실행 자동 복구" 가 전제. Push 가 사용자를 다시 데려오면, 그 다음 화면 표시는 결정 13 의 init resume 흐름이 이어받음.

## 1. 배경 / 목적

**현 상태.** PWA 설치 + Job 비동기 + 강제종료 복구까지 완성. 단, 사용자가 답변 완료를 _능동적으로_ 확인하려면 직접 PWA 다시 열어야 함.

**목표.** 진짜 카톡/텔레그램 수준. 사용자가 다른 앱 쓰고 있거나 PWA 닫혀있어도, 답변 완료되면 **시스템 알림** 으로 통지. 알림 탭 → PWA 열림 → 결정 13 의 init resume 가 답변 자동 표시.

**비목표 (이번 작업 제외).**
- 그룹 채팅/멘션 알림 등 메신저 기능.
- iOS Safari (browser 모드) 푸시 — Apple 정책상 PWA 설치된 경우만 지원. 본 작업은 안드/iOS 둘 다 "설치된 PWA" 전제.
- 알림 채널 분리 (errors / completions / progress 등) — v1 은 "답변 완료" 한 종류만.

## 2. 작업 갈래

### A. 서버 측

목표. VAPID 키 관리 + subscription 저장 + 답변 완료 시 푸시 전송.

- `web-push` npm 패키지 추가.
- **VAPID 키.** 첫 서버 기동 시 `.vapid.json` 자동 생성 (gitignore). publicKey 만 `/api/push/vapid-key` 로 노출.
- **subscription 저장.** 메모리 + JSON 파일 영속 (`pushSubscriptions.json`). 사용자당 여러 device 가능 → `{ userId, endpoint, keys, createdAt, lastSeenAt }` 배열.
- **새 엔드포인트 3개.**
  - `GET /api/push/vapid-key` — 클라이언트가 subscribe 시 사용할 public key
  - `POST /api/push/subscribe` — 사용자 device 등록
  - `POST /api/push/unsubscribe` — 사용자가 알림 끄기
- **푸시 트리거.** `jobsManager.finishJob` 직후, **현재 subscribers (SSE) 가 없는 경우만** 푸시 전송. 페이지 보고있는 사용자에게는 알림 안 보냄.
- **subscription 만료/410 처리.** `web-push.sendNotification` 가 `410 Gone` 또는 `404` 반환 시 해당 subscription 자동 제거.

### B. 클라이언트 측

목표. 권한 요청 + subscription 등록 + 푸시 받은 후 알림 표시.

- **권한 요청 타이밍.** 사용자가 _첫 질문 보낼 때_ (지금이 가장 자연스러움). 거부해도 다음 기회에 다시 권유 (cooldown 24시간).
- **subscribe 흐름.** 권한 OK → `Notification.requestPermission` → `sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → 서버에 POST.
- **SW push 핸들러.** `self.addEventListener('push', ...)` → `showNotification(title, { body, icon, data: { jobId, chatId } })`.
- **알림 클릭.** `self.addEventListener('notificationclick', ...)` → 기존 PWA 윈도우 있으면 focus, 없으면 새로 open. URL 에 `?resumeJob=<jobId>` 쿼리 추가 — init resume 가 자동으로 그 job 표시.
- **알림 끄기 UI.** 사이드바 하단에 "🔔 알림 켜기/끄기" 토글 1개. localStorage 에 권한 상태 캐시.

## 3. 성공 기준

- 안드 PWA. 질문 → 다른 앱 → 답변 완료 시 시스템 알림 도착 → 알림 탭 → PWA 열리고 답변 자동 표시.
- iOS PWA (홈화면 설치, Safari 16.4+). 동일 시나리오 동작.
- 권한 거부한 사용자도 기존 기능 정상 (Push 없는 fallback = 결정 13 의 init resume 만으로도 답변 살아있음).
- 동일 사용자 여러 device (PC + 폰) 둘 다 알림 수신.
- 페이지 보고있는 사용자에겐 알림 안 옴 (중복 방지).

## 4. 위험 / 미해결

- **iOS Safari 의 변덕.** Web Push 가 iOS 에서 가끔 안 옴 (Apple 의 ATT/저전력 모드). 사용자가 신뢰할 수 없으면 답답해할 수 있음 → 알림 안 와도 init resume 로 답변은 살아있음을 안내 필요.
- **VAPID 키 분실.** `.vapid.json` 삭제 시 모든 subscription 무효화 — 사용자 재구독 필요. 백업 안내 또는 `.vapid.json` 영속화 견고하게.
- **푸시 페이로드 크기 제한.** 일부 push service 가 ~4KB 제한. answer 전체 보내지 말고 jobId + 제목만.
- **subscription endpoint 영속화 안 함 시 서버 재기동 = 알림 전부 끊김.** JSON 파일 영속화 필수.
- **사용자 모든 device 에 동일 알림.** 한 device 에서 PWA 열어 답변 봤다면 다른 device 에서도 알림 dismiss 되도록 처리는 v2.
- **시간 지연.** Push service (FCM/APNs) 거쳐서 오므로 즉시 도착 보장 없음. 평균 1~5초.
- **메인 chrome 의 권한 다이얼로그.** 처음 보면 사용자가 당황. 권한 요청 직전에 컨텍스트 설명 모달 띄우는 게 일반적 (LinkedIn/Reddit 패턴).

## 5. 다음 단계

A → B 순서. A 완료 후 서버에서 수동으로 publickey 받고 클라이언트에서 subscribe 한번 테스트 → B 진입.

순서.
1. `.gitignore` 에 `.vapid.json`, `pushSubscriptions.json` 추가
2. `web-push` 의존성 추가
3. 서버. VAPID 헬퍼 + subscription 저장 + 3개 엔드포인트 + finishJob 트리거
4. 클라이언트. 권한 요청 UX + subscribe API 호출 + SW push/click 핸들러
5. URL 의 `?resumeJob` 쿼리 처리 → init resume 로직 약간 보강 (activeJob 우선, 없으면 ?resumeJob 으로 fallback)
6. 데스크탑 Chrome 회귀 → 안드 PWA 실기 → iOS PWA 실기
7. commit
