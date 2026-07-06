# CodeMirror 6 소스뷰어 교체 — 체크리스트

Prism → CodeMirror 6 (뷰어 한정. 채팅 diff 는 Prism 유지).

- [x] npm: esbuild(devDep) + codemirror + lang-(java/javascript/sql/html/css/cpp/xml/json) + theme-one-dark + search 설치
- [x] `src/cm-entry.mjs` 작성 — 확장자→언어 매핑, 라인번호 Compartment, read-only, search, oneDark, createSourceView API
- [x] esbuild 번들 → `public/cm.bundle.js` (IIFE, global `CMView`), package.json `build:cm` 스크립트
- [x] index.html: `<pre><code id=svCodeBlock>` → `<div id=svCodeHost>` 교체, cm.bundle.js 로드
- [x] svApplyEncoding: Prism 렌더 → CMView.render(host, content, ext, showLN) 로 교체 (인코딩/유니코드 디코드 로직은 유지)
- [x] 라인번호 토글 → CM 라인번호 Compartment 재구성
- [x] 다운로드: 원본 base64 그대로 (기존 유지 — codeEl 의존 제거)
- [x] 뷰어 전용 Prism 추가분(문법 선로딩·line-numbers 플러그인) 제거 — 채팅용(core/autoloader/diff/diff-highlight)만 남김
- [x] 검증: 구문체크 + 브라우저 하드리로드로 .java/.pc/큰파일/라인번호/검색 확인

## 후속 — 레포 전체 검색 + 내용검색 + 라인번호 default (2026-06-30)
- [x] 라인번호 체크박스 default ON (checked)
- [x] 서버 `/api/fs/search` — 레포 전체 walk, 파일명(NAME_SKIP_EXTS 제외) + 내용 grep(SOURCE_EXTS). 동기+타임버짓 1s, 캡(이름100/내용200/파일당20/1.5MB). SHADOW_XD 디렉터리 제외 재사용. auth+경로이탈 가드
- [x] cm-entry `gotoLine(n)` — 내용매칭 클릭 시 해당 라인 스크롤+선택. 번들 재빌드
- [x] 사이드바 검색 repo 전체 전환 — svOnSearchInput(디바운스300ms·2글자↑) → svRepoSearch(seq 가드) → svRenderSearchResults(파일명/내용 flat 리스트). 내용행 클릭→svReadFile(path,name,line)→show-content先→gotoLine
- [x] 검증: 검색로직 기능테스트(라인번호 정확·노이즈필터), gotoLine 스크롤 착지(puppeteer), 구문체크
