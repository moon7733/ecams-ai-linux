# Context Notes — 결정 근거 / 검증 결과

작업하면서 내린 결정과 그 이유. 다음 세션이 재구성 없이 이어갈 수 있도록 누적.

---

## 2026-06-02 — 초기 결정

### 결정 1. "앱" 의 정의 — 네이티브 앱 아닌 PWA — 2026-06-02

**선택**: PWA + 홈 화면 추가.
**대안 (탈락 1)**: Electron/Tauri 데스크탑 앱. 핸드폰 사용 목표 미달.
**대안 (탈락 2)**: React Native / Flutter. UI 전면 재작성 (3,726줄 vanilla HTML/CSS/JS) + 백엔드 원격화 필수. 2~3개월 규모. ROI 안 맞음.
**이유**: 사용자가 "꼭 앱스토어 배포 불필요, 핸드폰에서 쓸 수 있으면 됨" 확정. HTTPS (Cloudflare Tunnel) 이미 구축돼 PWA 설치 조건 (manifest + sw + HTTPS) 중 HTTPS 자동 충족. 남은 건 manifest + sw 만 추가하면 됨.

### 결정 2. 백엔드는 로컬 윈도우 PC 그대로 — 2026-06-02

**선택**: `server.js` 를 윈도우 로컬에 그대로 두고, 이미 운영 중인 Cloudflare Tunnel 로 외부 노출.
**대안 (탈락)**: 리눅스 서버 이전.
**이유**: 사용자가 "일단은 로컬에서" 확정. 추후 24/7 운영 필요해지면 별도 feature 로 이전. LLM CLI (`agy`, `claude`, `gemini`) 가 윈도우 환경에 셋업돼 있고 `node-pty` 의존 — 리눅스 이전 시 별도 검증 필요. 모바일 PWA 작업과 분리하면 회귀 위험 낮춤.

### 결정 3. 임시 로고 — 현재 사이드바 로고 ("E" 파란 배경) 그대로 PNG화 — 2026-06-02

**선택**: [public/index.html](../../public/index.html) 74줄 부근 `.logo-icon` (배경 `#2563eb`, 흰색 "E", 둥근 모서리) 를 PNG 로 변환. 192/512 두 사이즈.
**이유**: 사용자가 "임시" 명시. 정식 로고는 추후 디자이너 작업. PNG 생성은 PowerShell `System.Drawing` 으로 빌드 의존성 없이 처리 — Node 패키지 추가 없음.
**미해결**: maskable 아이콘 별도 안 만듦. Android 의 마스킹된 모양에서 글자가 잘릴 수 있음 — 실기 확인 후 필요하면 padding 추가한 별도 maskable 버전 생성. 일단 `purpose: "any"` 만으로 진행.

### 결정 4. Service Worker 캐시 범위는 정적 자산만 — 2026-06-02

**선택**: precache = `index.html`, `manifest.json`, 아이콘 PNG 만. `/api/*` 와 외부 CDN (fonts.googleapis.com, Prism CSS) 은 network-only.
**대안 (탈락)**: stale-while-revalidate 로 API 까지 캐시.
**이유**: LLM 응답은 매번 다름. 답변 캐시는 이미 서버 측 `answer_cache.json` + semantic caching (agy-integration 결정 25) 으로 처리. SW 가 추가로 캐시하면 (a) 디버깅 어려움 (b) 결정 26 의 Stop 기능과 충돌 가능 (캐시 응답은 abort 무의미) (c) 결정 27 의 diff 출력 / 결정 28 의 이미지 첨부가 즉시 반영 안 될 위험.

### 결정 5. index.html 은 network-first — 2026-06-02

**문제**: SW 가 index.html 을 단순 precache 하면, 서버에서 index.html 수정해도 사용자 화면에 반영 안 됨. 모바일 UI 보강 작업 중 매 수정마다 사용자가 SW 갱신 절차 거쳐야 함.
**선택**: index.html 은 SW 에서 `network-first` 전략. 네트워크 실패 시에만 캐시 폴백. 정적 자산이지만 자주 바뀜.
**대안 (탈락)**: precache 에 버전 해시 부여. 빌드 파이프라인 없는 vanilla 환경에서 과한 셋업.

### 결정 6. 모바일 반응형 breakpoint — 768px 단일 — 2026-06-02

**선택**: `@media (max-width: 768px)` 하나로 모바일/태블릿 묶기.
**이유**: 단일 breakpoint 가 관리 단순. 태블릿 (iPad portrait) 도 사이드바 햄버거화가 자연스러움. 추후 필요 시 1024px 추가 가능. 현재 사이드바가 260px 고정이라 1024 미만 화면은 모두 좁음 처리해도 무방.

### 결정 7. 가상 키보드 가림 해결 — visualViewport API — 2026-06-02

**문제**: iOS Safari / 안드로이드 Chrome 에서 가상 키보드 올라오면 `position: fixed` 입력창이 키보드 뒤에 가리거나, viewport 가 점프하는 현상. 결정 26 의 정지 버튼이 입력창 안에 있어서 같이 들어 올려져야 함.
**선택**: `window.visualViewport.addEventListener('resize', ...)` 로 키보드 높이 감지 후 입력창 `bottom` 동적 조정.
**대안 (탈락)**: `position: sticky` 만으로 처리. iOS Safari 에서 동작 불안정.
**참고**: 결정 28 의 라이트박스는 이미 풀스크린 fixed 라서 이슈 없음.

### 결정 8. PWA 메타 태그는 단일 manifest + iOS 보완 — 2026-06-02

**선택**: 표준은 `<link rel="manifest">` 로 통일하되, iOS 제약 때문에 `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` 메타를 추가로 박음.
**이유**: iOS Safari 는 W3C manifest 일부 (특히 `display: standalone`, 아이콘) 를 무시함. iOS 전용 메타가 있어야 홈 화면 추가 시 풀스크린 + 의도된 아이콘 표시.

### 결정 9. 배포 방식 = PWA. .apk (TWA) 미채택 — 2026-06-02

**선택**: 다른 사용자에게도 "URL 접속 → 홈 화면에 추가" PWA 방식으로만 배포. APK 빌드(TWA) / 네이티브 wrap (Capacitor) 미채택.
**대안 (탈락 1)**: TWA 로 .apk 빌드해 사이드로딩. Bubblewrap 셋업 + 서명 키 관리 + Digital Asset Links + 매 업데이트마다 apk 재배포 (+2~3일). 안드로이드만 가능 → iOS 사용자 한 명이라도 있으면 의미 없음.
**대안 (탈락 2)**: Capacitor/Cordova 네이티브 wrap. iOS 는 개발자 계정 + TestFlight 사실상 필수.
**이유**: 사용자 우려 = "다른 사용자도 Cloudflare 설치 + 여러 작업 해야 하는 거 아니냐". 실제 PWA 는 다른 사용자에게 (1) URL 탭 (2) 메뉴 → 홈 화면에 추가 두 단계가 끝. Cloudflare Tunnel 은 운영자(현재 사용자) 한 번만 셋업, 다른 사용자는 일반 웹 접속과 동일. APK 가 오히려 "출처 알 수 없는 앱 허용" 토글 등으로 진입 장벽이 더 큼.

### 결정 10. 첫 모바일 접속 시 안내 배너 1회 노출 — 2026-06-02

**선택**: 모바일 폭 (≤768px) + 비-standalone 모드 (`display-mode: standalone` false) 일 때 화면 하단에 안내 배너 표시. "홈 화면에 추가하면 앱처럼 쓸 수 있어요" + 닫기 버튼.
**OS 별 분기**:
- **안드로이드 Chrome**: `beforeinstallprompt` 이벤트 캐치 → "설치" 버튼 직접 노출. 한 탭에 끝.
- **iOS Safari**: `beforeinstallprompt` 미지원. 텍스트 안내만 — "공유 버튼 → 홈 화면에 추가" 일러스트 + 1줄 설명.
**닫기 상태 영속화**: `localStorage.setItem('pwa-banner-dismissed', '1')`. 한 번 닫으면 다시 안 띄움. 단 standalone 모드 (이미 설치 완료) 진입 시에는 항상 미표시.
**이유**: 결정 9 가 "PWA 로 가자" 였으나, "홈 화면에 추가" 가 다른 사용자에게 낯설 수 있다는 사용자 우려 반영. 안내 없으면 설치 funnel 0%. 다만 매 방문마다 노출하면 광고처럼 거슬리므로 1회 노출 + 닫기 영속화.

### 결정 11. 답변 내 diff 블록 색상화 = Prism diff-highlight 재사용 — 2026-06-04

**문제**: 채팅 답변의 ` ```diff ` 코드블록이 단색 + `white-space: pre-wrap` 으로 줄이 접혀서, 모바일에서 `+`/`-` 변경 줄 구분이 사실상 불가능 (사용자 스샷). `formatContent` 가 코드펜스의 lang 을 잡아만 두고 안 썼음.
**선택**: 이미 로드돼 있던 Prism 1.29 (소스뷰어용) 에 `prism-diff` 컴포넌트 + `diff-highlight` 플러그인(CSS/JS)만 추가. lang 이 `diff`/`patch` 면 `<pre class="diff-highlight language-diff">` 로 렌더 후, 답변 확정 시점에 `Prism.highlightAllUnder(bubble)` 호출. GitHub 풍 초록/빨강 줄 배경 + 왼쪽 gutter 띠 + `@@` 헝크 헤더 죽이기 CSS override.
**모바일 핵심**: diff 블록만 `white-space: pre` + `overflow-x: auto` 로 줄바꿈 대신 가로 스크롤 → 줄 구조 보존 (일반 코드블록은 기존 pre-wrap 유지).
**스트리밍 처리**: 토큰마다 하이라이트하면 깜빡임/비용 → 스트리밍 중엔 평문, `done` 핸들러에서 1회만 하이라이트. 부분 ` ```diff ` 는 닫힘 펜스 전까지 정규식 미매치라 평문 유지 (문제 없음).
**대안 (탈락)**: `formatContent` 에서 줄 prefix 보고 직접 span 색칠. Prism 이 이미 있어 재사용이 더 적은 코드 + 일관성.

### 결정 12. 파일 경로 링크 → 파일명 칩 + 탭 시 소스뷰어 — 2026-06-04

**문제**: 답변의 `[텍스트](file:///C:/ecams-ai/workspace/회사/repo/...)` 가 (1) `formatContent` 에 링크 변환이 없어 대괄호째 raw 노출, (2) 전체 경로가 모바일에서 3줄로 깨짐 (사용자 스샷).
**선택**: `file:///` 마크다운 링크를 **파일명만 보이는 칩**으로 변환 (`buildFileChip`). 마스킹/이스케이프 **전에** placeholder(`\x00FC`) 로 추출해 URL 보존.
- **데스크탑**: 칩 `title` = 회사/repo/상대경로 (머신 경로 `C:/ecams-ai/workspace` 는 떼어내 보안 마스킹 유지). hover 시 툴팁.
- **탭 동작 (결정: 소스뷰어 기본)**: `workspace/` 링크만 clickable → `openFileFromChip(repoKey, relPath, fileName)` 로 소스뷰어에 바로 표시. `wiki`/`indexes`/권한없는 repo 는 표시-only 칩(📖/🗂️). 위키는 커버리지 불완전 → "없는 파일 탭 = 죽은 탭" 회피 위해 보조로 미룸.
**repo 키 매핑**: URL `workspace/회사/repoSeg/...` 에서 repo 키 = `LOCAL_REPOS` 경로의 마지막 폴더명(= MY_REPOS 키). 세그먼트 중 MY_REPOS 에 존재하는 **마지막** 것을 repo 로, 그 뒤를 상대경로로. nfcf 처럼 `repo/repo` 중첩 폴더도 정상 처리 (node 시뮬로 검증). 권한은 서버 `/api/fs/read` 가 재차 강제.
**미검증**: 실기/브라우저 렌더 확인은 사용자 디바이스 테스트 필요 (문법·변환 로직만 node 로 검증).

### 결정 11·12 후속 픽스 — 실기 1차 피드백 반영 — 2026-06-04

사용자 실기(안드로이드 PWA) 확인 후 4건 수정.
- **diff 글자 흐림**: 채팅은 라이트 테마(`--surface2: #f0efed`)인데 diff 가 prism-tomorrow(다크용) 글자색(#ccc)을 받아 흰 배경에서 흐렸음. → 모든 `.bubble pre`(코드블록)를 다크 카드(`#2d2d2d` 배경 + `#e8e8e8` 글자)로 통일. 소스뷰어 톤과 일치. `.bubble pre code` 는 인라인 code 의 밝은 배경 칩을 `transparent` 로 리셋(안 하면 다크 pre 위에 밝은 박스).
- **diff 가로 스크롤 시 버블 밀림**: `.message` 가 flex 라 자식 `.bubble` 이 `min-width:auto` → 넓은 diff 가 버블을 늘림. → `.bubble { min-width: 0 }` + `.bubble pre { max-width: 100% }`.
- **헤더 뒤 첫 리스트 들여쓰기 누락**: 헤더 정규식 `^#{1,6}\s+(.*)(?:\n)?` 의 `(?:\n)?` 가 헤더 뒤 개행을 삼켜 다음 첫 리스트 항목이 헤더에 붙어 `^` 미매치 → 들여쓰기 안 됨(2번째 항목부터만 됨). → `(?:\n)?` 제거(`...(.*)$`). 남는 개행은 기존 `</div>(<br>)+` 정리 로직이 흡수. node 시뮬로 검증.
- **소스뷰어 풀스크린**: 모바일 `.sv-modal` 을 `100vw/100dvh` + `max-height:100dvh!important`(modal-card `max-height:90vh` 무력화) + `border-radius:0`. `.sv-header` 패딩 `6px 12px` 로 축소.
- **formatContent 코드추출 순서 버그**: `text.replace(/---/g, '\n\n---\n\n')` 가 코드블록 추출 **전에** 돌아서 diff 의 `--- a/file` 헤더를 `\n\n---\n\n a/file` 로 박살냈음(첫 스샷의 깨진 diff 원인 + 다운로드용 diff 텍스트도 오염). → 코드블록 추출을 마스킹·`---`/`##` 분리보다 **앞으로** 이동, 코드 내부 절대경로 마스킹은 추출 콜백 안에서 별도 수행.

### 결정 13. diff 블록 수정본 다운로드 = 서버에서 적용 — 2026-06-04

**사용자 선택**: 3안(.patch / 서버 적용 / AI 전체출력) 중 **서버 적용** — 의도("수정 완성된 소스 받기")에 부합 + 원본이 서버에 있어 신뢰성 높음.
**서버**: `POST /api/fs/apply-diff` {diff, repos}. `jsdiff`(npm `diff@5`) `parsePatch` 로 대상 파일 추출(`+++ b/<path>` → `^[ab]/` 제거), 권한 있는 후보 repo 중 그 경로가 실제 존재하는 곳 탐색, 원본 `\r\n→\n` 정규화 후 `applyPatch(original, diff, {fuzzFactor:2})`. 성공 시 `{ok, fileName, content}`, 적용 실패(컨텍스트 불일치) 시 409.
**클라**: `enhanceAnswer(el)` 로 통합(Prism 하이라이트 + diff 블록마다 "💾 수정본 다운로드" 버튼). 버튼 → `/api/fs/apply-diff` POST(`selectedRepos` 동봉) → 성공 시 수정본 파일 다운로드, 실패 시 confirm 후 `.patch` 폴백. diff 텍스트는 렌더된 `pre.diff-highlight code` 의 `textContent` 에서 추출(헤더가 `a/`·`b/` 상대경로라 마스킹 무관).
**검증**: 실제 repo(`kjbank_html5`) 파일로 round-trip(헤더 파싱→경로해석→applyPatch→원문 일치) node 테스트 통과. **운영 반영엔 서버 재시작 필요**(새 라우트 + `diff` 의존성).
**인코딩 한계**: v1 은 원본을 utf8 로 읽어 적용. 레거시 EUC-KR 파일은 컨텍스트 불일치로 적용 실패 가능 → 그땐 `.patch` 폴백. 필요 시 추후 `iconv-lite` + 인코딩 파라미터 추가.

### 2026-06-05 — 실기 2차 피드백 6건 (스샷: Cmd3100.java 수정 답변)

사용자가 일부러 "수정" 질문을 던져 diff 답변을 띄운 뒤 6건 보고. **추측 금지(§10) 대로 로그 원문**(`logs/answer_log_20260605.jsonl`, 질문 "프로그램 최초 생성자 컬럼")을 직접 떠서 원인 규명.

**원인 규명 (로그 데이터 기반)**.
- **마크다운 줄바꿈/들여쓰기**. 모델이 섹션 사이 개행을 빠뜨리고 glue. 원문에 `...했습니다.## 4`, `## 5. 유지보수 참고사항**5-1. 수정 범위 판정**` 처럼 헤더가 문장/소제목에 붙어 옴. + "프론트엔드/cmr0020" 미들여쓰기는 **중첩 리스트**(`  - ` 앞 공백 2칸)인데 `formatContent` 리스트 정규식이 `^[\*\-]`(col 0) 만 잡아 놓침. `(1)(2)` 안 깨진 건 모델이 판정문장을 통째 백틱 인라인코드로 감싼 탓(모델 스타일).
- **diff 계단현상 + 적용 실패는 같은 뿌리**. 로그 원문 diff 의 context 줄이 prefix 누락(col 0) + 들여쓰기 제각각(16/24칸) + hunk 헤더 줄수 오류 + **context 줄 누락·내용 변형**. `white-space:pre` 가 망가진 공백을 그대로 렌더 → 계단. applyPatch 가 원본과 매칭 실패 → 409. (어드바이저는 "별개 원인"으로 봤으나 데이터상 동일 뿌리 = 모델의 malformed diff. Cmd3100.java 는 utf8 클린이라 EUC-KR 무관 확인.)
- **소스뷰어 양옆 공간**. `.modal-card { padding:32px }` 가 모바일 `.sv-modal` 에서 미오버라이드.
- **.patch 폴백 무반응**. `downloadText` 가 blob URL 을 `setTimeout(…,0)` 즉시 해제 → 모바일에서 다운로드 시작 전 취소.

**결정 14. "수정본 다운로드" 안정화 = 프롬프트 + 느슨 적용 (사용자 선택)**.
- **프롬프트(server.js SYSTEM_PROMPT)**. 5-2 에 정상 unified diff 규칙 명시(모든 줄 prefix 필수, context 는 공백 1칸, 원본 들여쓰기 글자 그대로, context 3줄 연속, `@@` 줄번호·줄수 정확). + 별도 "마크다운 출력 규칙" 섹션(헤더/소제목/`---` 앞뒤 빈 줄, 헤더 glue 금지, 중첩 2칸, `(1)(2)` 백틱 금지). → **근본(생성) 해결, 향후 답변 개선**.
- **서버 느슨 적용(`applyDiffTolerant`)**. ①엄격 `applyPatch(fuzz2)` → 실패 시 ②`repairDiffPrefixes`(prefix 없는 hunk 줄에 공백 보정) + 공백무시 `compareLine`(collapseWs) + fuzz4. **위치 재배치(Tier3)는 제외** — 실제 케이스(block0) 도 못 살리고 복잡도만 늘어 §2 단순성 위반. 심하게 망가진 diff 는 `.patch` 폴백.
- **검증(node 하네스, 실제 파일+실제 로그 diff)**. PrgListReport.js block = 느슨 적용 성공(creuser 삽입 확인). Cmd3100.java block = context 누락·변형이 심해 어떤 자동적용도 불가 → `.patch` 폴백 정상. `node --check server.js` 통과.

**결정 14 후속 클라 픽스(index.html)**.
- 중첩 리스트. 리스트 정규식 `^([ \t]*)(bullet)\s+(.*)` 로 앞 공백 캡처 → 공백 2칸=1단계, `margin-left = 14 + depth*16`. (검증: 프론트엔드/cmr0020 = 30px)
- glue 헤더 방어. `**\d+-\d+\.`(5-1/5-2) 앞에 `\n\n` 삽입 (bold 변환 전). 헤더 split 은 기존 `(##+ )` 로직이 처리.
- 소스뷰어 풀스크린. 모바일 `.sv-modal { padding:0 !important }`.
- 다운로드 버튼. diff 헤더 `+++ b/...` 에서 파일명 추출 → `💾 Cmd3100.java (수정본)`. 다운로드 파일명은 서버가 주는 basename 그대로.
- `downloadText`. `application/octet-stream` + revoke 지연 4초 (모바일 인라인 오픈/조기취소 방지).

**⚠️ 캐시 함정 (테스트 방법 주의)**. 프롬프트 개선은 **생성 시점**에만 적용. 같은 질문("최초 생성자 컬럼")은 `answer_cache.json` 에 이미 캐시돼(semantic caching) **깨진 diff 가 그대로** 재생됨.
- 재시작 후 같은 질문으로 확인 가능 = 마크다운 들여쓰기/줄바꿈, 소스뷰어 풀스크린, 버튼 파일명, `.patch` 다운로드 (이들은 렌더/CSS 단이라 캐시 답변에도 적용).
- **새 질문(캐시 미스)으로만 확인 가능** = diff 품질 개선 + 수정본 다운로드 *적용 성공*. 기존 Cmd3100 답변은 캐시된 깨진 diff라 계속 `.patch` 폴백.
- 느슨 적용은 공백 무시 매칭이라 드물게 다른 hunk 가 오배치될 수 있음 → 다운로드 받은 파일은 한 번 눈으로 확인 권장.

**미검증(서버 재시작 + 실기 필요)**. 프롬프트 개선 후 실제 답변 diff 품질, 느슨 적용으로 정상 diff round-trip, 소스뷰어 좌우 풀스크린, .patch/수정본 다운로드 모바일 동작, 마크다운 줄바꿈/들여쓰기 실렌더.

### 2026-06-05 (2차) — 서버 재시작 후 Antigravity flash 3.5 답변 피드백

서버 재시작 후 새 질문(체크인→ResourceView 새로고침, model=agy). 로그 `ans2`(질문 "체크인…새로고침") 원문 확인.

**확인된 성과**. ① 프롬프트 효과로 **diff 가 정상 형식**(context 공백 prefix·`@@` 정상)으로 나옴. ② 그 결과 **수정본 다운로드 성공** — `UpdateStatusJob.java` 에 `asyncExec`+`refreshAction.run()` **12줄 순수 추가, 삭제 0, 중괄호 균형 OK**, 위치 정확(`broadcastModificationStateChanges` 직후). 다만 모델이 삽입줄을 탭 대신 공백으로 들여써서 원본(탭)과 혼용(동작 무관). strict 는 실패, tolerant(느슨) 적용으로 성공.

**남은 버그 → 추가 수정**.
- **헤더-본문 glue**. flash 3.5 는 개행을 거의 안 넣어 `## 1. 요약이클립스 및 DOMA…` 처럼 헤더에 본문을 통째 붙임 → 헤더 정규식이 문단 전체를 헤더로 먹음. 기존 `(##+ )`·`**N-N**` split 으로 안 잡힘. → **알려진 섹션 제목**(분석 근거/요약/실행 흐름/로직 상세/주요 파일 및 DB 테이블/유지보수 참고사항/추천 추가 질문) 앞뒤로 `\n\n` 강제 삽입(`formatContent`). 우리가 포맷을 통제하므로 신뢰 가능. (검증: 헤더 7개 모두 본문과 분리)
- **diff 우측 치우침**. 깊게 중첩된 코드(6단계) + 원본 탭 + 삽입 공백 → `white-space:pre` 가 그대로 렌더. → ① 표시용 **dedent**(`dedentDiff`: 본문 공통 최소 들여쓰기 제거, 탭=2칸 환산) + ② `.bubble pre.diff-highlight { tab-size:2 }`. **다운로드/적용은 dedent 안 된 원본 사용** → `pre[data-rawdiff]` 에 `encodeURIComponent(raw)` 보존, `attachDiffDownloads` 가 거기서 읽음. (검증: 24칸→9칸, rawdiff 에 `+++ b/` 보존)
- **순수 추가 diff 라 "변경된 소스만 보임"은 정상**(삭제줄 없음). unified diff 특성 — 사용자에게 설명 필요.

**⚠️ stale 클라이언트 함정**. SW(`sw.js`)는 index.html 을 navigate(새로고침) 때만 network-first 로 fresh. **PWA 를 열어둔 채 질문만 보내면 예전 CSS/JS 유지** → 소스뷰어 풀스크린·마크다운·diff dedent 등 **클라 수정이 안 보임**. 서버 수정(프롬프트·apply-diff)은 즉시 반영(다운로드 성공이 증거). → 클라 수정 확인하려면 **PWA 완전 종료 후 재실행(또는 당겨서 새로고침)** 필수.
