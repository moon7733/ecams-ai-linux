# 소스뷰어 업그레이드 — Context Notes

## 코드 위치 (2026-06-30 조사)
- 소스뷰어 모달 HTML: `public/index.html` 2221~2264
- 소스뷰어 JS: `openSourceViewer`(2571), `svReadFile`(2697), `svApplyEncoding`(2721), `svDownloadFile`(2767)
- 파일칩: `buildFileChip`(3980), `openFileFromChip`(4004), `formatContent`(3874)
- CM 번들 엔트리: `src/cm-entry.mjs` (window.CMView: render/setLineNumbers/openSearch/gotoLine). 빌드 = `npm run build:cm`
- 소스뷰어 CSS: 데스크탑 1250~1477, 모바일(`@media max-width:640`) 1016~1074
- 분석 LLM 후보: `runClaudeCodeStream`(server.js 2443)이 `spawn('claude', ...)` 사용 — CLI 인증 기반, API 키 불필요. MODEL_IDS sonnet/haiku(2426).
- 파일 read 엔드포인트: `/api/fs/read`(server.js 690), 권한 `getRepoLevel`.
- `express.json({ limit: '200mb' })` (153) — body 크기 제약 없음.

## 결정 로그
- **D1** 분석 엔드포인트는 클라이언트가 디코드한 텍스트를 전송하는 방식으로 통일(서버 재read X). 이유. native2ascii 디코드된 한글이 LLM 입력이 되어야 정확하고, 경로이탈 가드가 불필요하며, 3·4번이 한 경로를 공유.
- **D2** 분석 모델 = Claude CLI lean 스폰. `getSystemPrompt()`(RAG 프롬프트)는 단일파일 분석에 해로워서 미사용.
- **D3** 비스트리밍 + 스피너. 요구사항이 스트리밍 불요.
- **D4** Req1 은 `inputmode:'none'` (editable:false 는 Ctrl+F 검색을 깨므로 금지 — 기존 주석 근거).
- **D5** Req2 는 칩 케이스만 처리(맨파일명 형태 제외). 사용자 보고 "소스뷰어가 열려도" = 칩은 이미 동작 중이라는 신호.
- **D6** 모바일 분할 CSS 의 `.sv-cm-host { right:0 }` 는 뒤쪽 데스크탑 `right:50%`(동일 특정도)에 소스순서로 밀려 죽음 → `!important` 로 해결(기존 모바일 블록 관례와 동일). 어드바이저 지적.
- **D7** Req4 트리거. 요구사항대로 데스크탑=우클릭(contextmenu), 모바일=드래그 직후(touchend). matchMedia('(max-width:768px)')로 분기. mouseup 전체 노출은 단순 복사 선택까지 방해해 폐기.
- **D8** ANALYZE_MAX_CHARS 80000→200000. 파일 전체 분석이 본 용도라 큰 .java/.pc 가 80K 에서 413 나는 게 헤드라인 케이스를 막음.

## 1차 사용자 피드백 반영 (2026-06-30)
- **F1** 소스분석/드래그질문 버튼이 전폭으로 늘어남 → 전역 `.modal-card button{width:100%}`(특정도 0,1,1)에 밀림. 다운로드 버튼처럼 `width/padding/margin !important` 로 제압해 컴팩트화.
- **F2** 분석결과 표 깨짐·과도공백 → `formatContent`(RAG 전처리: `---` 분리가 GFM 표 구분행을 파괴)를 버리고 위키와 동일하게 `marked.parse({gfm,breaks:false})` 직접 사용 + Prism. 프롬프트에 "도식은 ``` 코드블록, 표는 GFM 문법" 지시 추가.
- **F3** 드래그질문 버튼 데스크탑 = 우클릭 시 마우스 커서 위치에 컨텍스트메뉴처럼 작게(svShowAskAt). mousedown 시 숨김.
- **F4** 모바일 네이티브 복사메뉴가 먼저 떠서 첫 드래그에 안 보임 → `selectionchange` 디바운스(350ms)로 듣고 하단 중앙 고정 표시(svShowAskBottom), 네이티브 메뉴와 비충돌.

## 분할 핸들(리사이저) 추가 (2026-06-30)
- 파일트리|본문, 소스|분석결과 사이를 에디터처럼 드래그로 리사이즈. 포인터이벤트(마우스·터치 공용).
- 본문|분석 경계는 `--sv-split`(좌측 기준 %) CSS 변수로 통일. host `right: calc(100% - var(--sv-split))`, pane `left: var(--sv-split)`, 핸들 `left: var(--sv-split)`. 드래그가 변수 갱신.
- 트리 폭은 `.sv-sidebar` 인라인 width 갱신. 클램프. 트리 최소 180px, 본문 최소 320px / 분할 양쪽 최소 20%.
- 드래그 종료 시 `window resize` 이벤트 디스패치해 CM 재측정 유도.
- 모바일은 핸들 숨김(상하 고정 50/50). `bindSvResizers` IIFE.

## 검증 경계 (2026-06-30)
- 검증됨(컴포넌트). 번들에 inputmode/gotoLineRange/getSelection 포함, server.js syntax OK + pm2 재시작(restarts=2) + `/api/fs/analyze` 가 HTML 아닌 JSON(401) 반환, `claude -p ... --max-turns 1` 단발이 한국어 텍스트 정상 반환.
- 미검증(사용자/브라우저 필요). 로그인 토큰이 인메모리 세션이라 발급 불가 → 인증된 analyze 왕복(프롬프트 조립·spawn·{analysis} 응답형태)은 미실행. 분할패널/칩 라인하이라이트/모바일 키보드 억제/선택버튼 노출은 브라우저·실기기 시각 확인 필요.
