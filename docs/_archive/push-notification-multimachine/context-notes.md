<!-- 모바일 푸시 알림이 서버를 다른 PC 로 옮기면 안 오던 문제의 원인과 수정 기록 -->
# 모바일 푸시 알림 기기 간 유지 — 수정 기록 (2026-06-11)

상태. **완료 + 커밋/푸시됨** (commit `6965b1e1`).

## 증상

모바일에서 알림 설정을 켰는데 알림이 안 옴.

## 원인

서버를 본사 PC → 집 노트북으로 옮기면서.
- `.vapid.json`, `pushSubscriptions.json` 둘 다 **.gitignore** → 기기 간 동기화 안 됨.
- 집 노트북은 자기만의 **다른 VAPID 키** 생성 + 구독 목록 **0개**.
- 핸드폰 브라우저는 옛 키로 구독한 상태라 "켜짐"으로 착각하지만, 집 노트북 서버는 그 구독을 모르고(목록 0), 설령 알아도 키가 달라 못 보냄(403).
- 기존 구독을 새 서버에 재동기화하는 로직이 없어 자가 복구 안 됨.

(HTTPS 문제는 아님 — Cloudflare 터널로 secure context 충족. 환경은 안드로이드 Chrome.)

## 수정 (commit 6965b1e1)

- **pushManager.js** — VAPID 키를 **env 우선** 로드(`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`), 없으면 `.env` 자체 파서로 읽음. server.js 의 .env 로더보다 먼저 require 되므로 자체 로드.
- **.env** — canonical VAPID 키 추가. `.env` 는 git 커밋되므로 본사 PC 와 자동 공유됨(→ 같은 키 사용, 서버 옮겨도 구독 유효).
- **public/index.html**
  - 알림 토글에 성공/실패 alert + HTTP 상태 표시(원격 디버깅용).
  - 켜짐=강조색(var(--accent))/꺼짐=중립으로 **인라인 스타일 직접 지정**(버튼에 인라인 스타일이 박혀 클래스가 묻히던 문제 해결), alert 전에 상태 직접 갱신해 race 방지.
  - 앱 로드 시 기존 구독을 서버에 재등록(`resyncPushSubscription`) — 서버가 구독 목록을 잃어버려도 자가 복구. addSubscription 은 endpoint 로 idempotent.

## 검증

- 핸드폰 토글 → 집 노트북 `pushSubscriptions.json` 에 구독 3개 도착 확인.
- 서버에서 테스트 푸시 → `sent:3, removed:0` (FCM 배달 정상).

## 운영 메모

- 서버를 다른 PC 로 옮긴 직후엔 `pushManager.js`/`.env` 변경 적용을 위해 **서버 재시작** 필요(index.html 정적은 즉시 적용).
- `.env` 에 VAPID **개인키**가 커밋됨(기존 DEEPSEEK 키와 동일 관행). 비공개 레포 전제.
- 실제 알림은 설계상 **SSE 구독자 0일 때만** 발송(`maybeSendPush`) — 테스트하려면 질문 후 앱을 백그라운드로.
