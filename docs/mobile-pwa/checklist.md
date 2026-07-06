# Checklist

## A. PWA 설치 가능화

- [x] `docs/mobile-pwa/plan.md` 작성
- [x] `docs/mobile-pwa/checklist.md` 작성 (이 파일)
- [x] `docs/mobile-pwa/context-notes.md` 작성
- [x] 임시 로고 PNG 생성 — `public/icons/icon-192.png`, `icon-512.png` (현재 사이드바 로고 그대로)
- [x] `public/manifest.json` 작성 (name/short_name/start_url/display/theme/background/icons)
- [x] `public/sw.js` 작성 (정적 자산 precache + `/api/*` network-only, index.html 은 network-first)
- [x] [public/index.html](../../public/index.html) `<head>` 에 manifest/theme-color/apple-touch-icon link/meta 추가
- [x] [public/index.html](../../public/index.html) 본문 끝에 `navigator.serviceWorker.register('/sw.js')` 추가
- [x] **첫 모바일 접속 안내 배너 구현** (결정 10) — 모바일 + 비-standalone 시 하단 배너. 안드로이드 `beforeinstallprompt` 후킹 + iOS 텍스트 안내. 닫기 영속화 (`localStorage`)
- [ ] (선택) `server.js` 에 manifest/sw MIME 타입 명시 (express.static 이 알아서 처리하면 skip)
- [x] **banner DOM 타이밍 버그 fix** — IIFE 가 배너 div 보다 먼저 실행되어 `getElementById` 가 null 반환하던 문제. `DOMContentLoaded` 로 지연
- [x] **maskable 아이콘 purpose 추가** — manifest 의 192/512 icons 둘 다 `"purpose": "any maskable"` 로
- [x] **`?pwadebug` 디버그 모드** — URL 파라미터로 dismiss 플래그 클리어 + 상단 진단 박스 노출. push/모바일 UI 후속에서도 재사용 예정
- [x] (수동) 안드로이드 Chrome 에서 "앱 설치" 프롬프트 노출 + 설치 성공 확인 (2026-06-04)
- [ ] (수동) 설치된 PWA 홈 화면 아이콘 탭 시 풀스크린 (standalone) 으로 뜨는지 확인
- [ ] (수동) 설치된 아이콘 모양이 안드 마스킹에서 잘리지 않는지 확인
- [ ] (수동) iOS Safari 에서 "홈 화면에 추가" 시 풀스크린 + 아이콘 정상 확인
- [ ] (수동) Lighthouse PWA 검사 통과 확인

## B. 모바일 반응형 UI 보강

### B1. 사이드바 햄버거화 (완료 — breakpoint 만 768→640px 차이)
- [x] CSS `@media (max-width: 640px)` 블록 — 사이드바 `position: fixed; display:none`, `.sidebar.mobile-open { display:flex }` ([index.html:894-907](../../public/index.html#L894-L907))
- [x] 햄버거 버튼 `.mobile-menu-btn` 모바일에서만 표시 ([index.html:890-892](../../public/index.html#L890-L892))
- [x] 드로어 오픈 시 어두운 백드롭(`.mobile-backdrop.open`) + 외곽 클릭으로 닫힘
- [x] 채팅 선택 / 새 채팅 후 자동 닫힘 (`classList.remove('mobile-open')` — 2270/2531/2822/2854/3379/3392줄)

### B2. 채팅 영역 / 입력창
- [x] 메시지 버블 좌우 padding 모바일에서 12px (chat-area padding: 12px 12px 8px 기존 구현)
- [x] 코드블록 `overflow-x: auto` + 폰트 크기 모바일에서 12px (`.bubble pre` 기존 구현 + word-break 해제)
- [x] **결정 11. diff 블록 색상화** — Prism `diff-highlight` 플러그인 추가, `formatContent` 에서 `diff`/`patch` lang 감지 → GitHub 풍 초록/빨강 줄 배경 + 왼쪽 gutter, `done` 시점 `Prism.highlightAllUnder`. diff 만 `white-space: pre` + 가로 스크롤로 줄 구조 보존
- [x] **결정 12. 파일 경로 링크 → 파일명 칩** — `file:///` 마크다운 링크를 파일명 칩으로 변환. 데스크탑 hover 시 경로 툴팁(머신 경로 마스킹 유지), `workspace/` 링크 탭 시 소스뷰어에서 해당 파일 열기. wiki/indexes/권한없음은 표시-only
- [x] **결정 11·12 후속 픽스** — diff 다크 카드화(라이트 배경 흐림 해소), 버블 밀림(`min-width:0`), 헤더 뒤 첫 리스트 들여쓰기, 소스뷰어 모바일 풀스크린, formatContent 코드추출 순서 수정(`---` 가 diff 헤더 깨던 버그)
- [x] **결정 13. diff 수정본 다운로드** — 서버 `/api/fs/apply-diff`(jsdiff `applyPatch`, fuzzFactor 2) + diff 블록 하단 "💾 수정본 다운로드" 버튼. 적용 실패 시 `.patch` 폴백. 실제 repo 파일 round-trip 검증
- [x] **결정 14. 실기 2차 피드백 6건** — 마크다운 중첩리스트 들여쓰기 + 헤더 glue 분리, diff 적용 안정화(프롬프트 정상 diff 규칙 + 서버 `applyDiffTolerant` 느슨 적용), 소스뷰어 모바일 풀스크린(`padding:0`), 다운로드 버튼 문구→파일명(수정본), `downloadText` 모바일 blob 타이밍. node 하네스로 실제 로그 diff·답변 검증
- [ ] (수동) 실기에서 diff 색상 + 칩 탭 + 수정본 다운로드 동작 확인 (**서버 재시작 필요** — 새 라우트 + 프롬프트 변경)
- [x] 입력창 `position: fixed; bottom: 0` + `visualViewport` resize 핸들러로 가상키보드 가림 회피
- [x] 결정 26 의 정지 버튼 터치 영역 44x44 이상 확보

### B3. 첨부 이미지 / 라이트박스
- [ ] 결정 28 의 라이트박스 모바일 핀치 줌 동작 확인
- [x] 라이트박스 닫기 버튼 44×44 터치 영역 확보
- [x] 첨부 이미지 미리보기 영역 모바일 폭 fit (`.bubble-image max-width: 100%` 기존 구현)
- [ ] (선택) 모바일에서 카메라 직접 호출 — `<input type="file" accept="image/*" capture="environment">` 옵션 추가

### B4. 다크모드 (선택)
- [ ] CSS `prefers-color-scheme: dark` 미디어 쿼리로 다크 팔레트 추가
- [ ] theme-color 메타도 미디어 쿼리로 분기

## C. 테스트
- [ ] 안드로이드 Chrome 실기 — 설치, 사이드바, 채팅, 첨부, 정지
- [ ] iOS Safari 실기 — 홈 화면 추가, 풀스크린, 가상키보드, 라이트박스
- [ ] 데스크탑 회귀 — 모바일 CSS 가 데스크탑 레이아웃 깨뜨리지 않는지

## D. 마무리
- [ ] (선택) 사용자 OK 시 git commit (논리 단위 분할 — "PWA 설치 가능화" + "모바일 반응형 UI" 최소 2개)
