# Plan — 모바일 PWA 전환

> **이전 작업 연결고리**: 본 feature 는 [`agy-integration/`](../agy-integration/) (결정 1~28) 의 후속 UX 작업이다. 백엔드 라우팅/응답 파이프라인은 그대로 두고, 핸드폰에서 "앱처럼" 쓸 수 있는 형태로 프론트만 확장한다. 결정 26 (Stop 버튼), 결정 27 (diff 출력), 결정 28 (첨부 이미지 라이트박스) 의 모바일 동작이 핵심 회귀 포인트.

## 1. 배경 / 목적

ecams-ai 는 현재 데스크탑 웹 UI 전용. [public/index.html](../../public/index.html) 은 사이드바 260px 고정 + DM Sans 외부 폰트 + 코드/diff 블록 폭 가정이 데스크탑 전제. Cloudflare Tunnel 로 외부 노출은 이미 되어 있어 핸드폰 브라우저 접속은 가능하나, 실사용은 사이드바/입력창/코드블록 가독성 문제로 불편.

**목표**.
- 핸드폰에서 **앱처럼** 동작 (홈 화면 추가 → 풀스크린 아이콘 실행).
- 모바일 화면에서 사이드바/입력창/답변 영역이 자연스럽게 동작.
- 백엔드 (`server.js`) 코드는 거의 그대로. 로컬 윈도우 PC 에서 그대로 운영.
- 앱스토어 배포 없음. Cloudflare Tunnel URL 직접 접속 → 홈 화면 추가.

## 2. 작업 두 갈래

### A. PWA 설치 가능화

목표. 안드로이드 Chrome 에서 "앱 설치" 자동 노출, iOS Safari 에서 "홈 화면에 추가" 시 풀스크린 아이콘 표시.

- `public/manifest.json` 신규. name, short_name, start_url, display: standalone, theme_color, background_color, icons (192/512).
- `public/sw.js` 신규. 정적 자산 (index.html, manifest, 아이콘) 만 precache. `/api/*` 와 외부 CDN 은 network-only.
- `public/icons/icon-192.png`, `icon-512.png` 신규. 현재 사이드바 로고 ("E", #2563eb) 그대로 PNG 화.
- [public/index.html](../../public/index.html) `<head>` 에 link/meta 추가. manifest, theme-color, apple-touch-icon. viewport 는 이미 있음.
- 본문 끝에 `navigator.serviceWorker.register('/sw.js')` 한 줄.
- **첫 모바일 접속 안내 배너** (결정 10). 모바일 폭 + 비-standalone 시 하단 배너. 안드로이드는 `beforeinstallprompt` 후킹해 "설치" 버튼, iOS 는 "공유 → 홈 화면에 추가" 텍스트 안내. 닫기 영속화 (`localStorage`).

### B. 모바일 반응형 UI 보강 (메인)

목표. 360px 폭에서도 가독 가능, 가상 키보드와 충돌 없음, 결정 26~28 의 모바일 회귀 없음.

- CSS `@media (max-width: 768px)` 한 블록으로 모바일 대응.
- 사이드바 → 햄버거 드로어 (left -260px → 0 transition, 백드롭, 외곽 클릭 닫힘).
- 채팅 영역 padding, 폰트, 코드블록 가로 스크롤. 결정 27 의 diff 블록 가독성 확인.
- 입력창 `visualViewport` API 로 가상 키보드 가림 회피. 결정 26 의 정지 버튼 터치 영역 44x44 확보.
- 결정 28 의 라이트박스 모바일 핀치 줌 동작 확인. 첨부 이미지 미리보기 폭 fit.
- (선택) 다크모드. `prefers-color-scheme: dark` 미디어 쿼리.

## 3. 성공 기준

### A. PWA
- 안드로이드 Chrome 에서 도메인 접속 시 "앱 설치" 프롬프트 자동 노출.
- iOS Safari "공유 → 홈 화면에 추가" → 풀스크린 + 아이콘 정상.
- Lighthouse PWA 검사 통과 (installable 카테고리).

### B. 모바일 UI
- 360px 폭에서 사이드바가 드로어로 들어가고 채팅 영역이 가독 가능.
- 가상 키보드 올라와도 입력창과 정지 버튼이 가려지지 않음.
- 결정 27 의 diff 블록, 결정 28 의 첨부 이미지가 모바일에서 깨지지 않음.
- 데스크탑 회귀 없음.

## 4. 위험 / 미해결

- **iOS Safari PWA 제약**. Chrome 같은 자동 install 프롬프트 없음. 사용자가 수동으로 "공유 → 홈 화면에 추가" 해야 함. 안내 문구를 첫 모바일 접속 시 1회 노출하는 것도 옵션.
- **Service Worker 캐시 vs API fresh 응답**. `/api/chat` 등 LLM 응답은 절대 캐시 금지. precache 범위를 정적 자산으로 좁게 정의. 결정 26 의 Stop 기능과 충돌 가능성 (캐시 응답은 abort 무의미) 도 같은 이유로 회피.
- **localStorage quota 와 결정 28**. 이미지 첨부 base64 가 모바일 Safari 의 5MB 제한에 더 빨리 닿을 수 있음. 결정 28 의 try/catch 폴백이 모바일에서도 잘 동작하는지 실기 확인.
- **maskable 아이콘 미준비**. Android 의 마스킹 모양에서 글자 잘림 가능성. 실기 확인 후 필요하면 padding 추가한 maskable 버전 별도 생성.
- **DM Sans 외부 폰트**. 모바일 데이터 연결에서 폰트 로딩 지연. 임시 로고는 시스템 폰트 + 단색 배경으로 가벼움 유지. SW precache 에는 외부 폰트 미포함.
- **세션 토큰과 SW**. 인증이 토큰 기반 (`sessions[token]`). SW 가 요청 변형하지 않게 fetch handler 에서 API 경로는 그대로 통과.

## 5. 다음 작업

A → B 순서. A 완료 후 사용자 실기 설치 검증 → B 진입. B 는 사이드바 → 입력창 → 라이트박스 → 다크모드 순으로 작은 단위 commit.
