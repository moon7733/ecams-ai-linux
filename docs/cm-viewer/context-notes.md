# CodeMirror 6 소스뷰어 교체 — 컨텍스트 노트

## 결정
- **Prism → CodeMirror 6 (뷰어 한정).** 채팅 버블 diff 는 Prism 유지(작은 diff, 잘 동작). 교체 이유는 대용량 파일 속도 — CM6 뷰포트 가상화가 보이는 줄만 렌더.
- **로컬 번들 방식 채택(CDN 런타임 X).** 단일 index.html(번들러 없음)에서 ESM `@codemirror/state` 싱글톤 문제를 피하려고 esbuild 로 한 번 번들. esbuild 가 dep 중복 제거 → 싱글톤 보장. 런타임 CDN 의존 0, 로딩 빠름.

## 구조
- `src/cm-entry.mjs` — 엔트리. `langFor(ext)`(.pc/.c/.h→cpp), read-only, 라인번호 Compartment, search/folding/bracketMatching, oneDark. export: `render(parent,doc,ext,showLN)`, `setLineNumbers(showLN)`, `openSearch()`.
- 빌드: `npm run build:cm` → `public/cm.bundle.js`(IIFE, global `CMView`, 684KB minify/~200KB gz). **생성 산출물이지만 서버 빌드스텝 없어 git 에 커밋.** 엔트리/언어팩 바꾸면 재빌드 필수.
- index.html: `<div id=svCodeHost class=sv-cm-host>` + `/cm.bundle.js` 로드. `svApplyEncoding` 이 인코딩/유니코드 디코드까지 한 `content` 를 `CMView.render` 로 넘김. 라인번호 토글은 `svToggleLineNumbers`→`setLineNumbers`(뷰 재생성 없이 Compartment 재구성).

## 검증
- puppeteer 헤드리스(scratch/cm_test.js, 정리됨): API·마운트·하이라이트 토큰·한글 렌더·라인번호 토글(거터 0→1)·.pc→cpp·콘솔에러0 통과.
- **미검증: 실제 앱 통합 시각 확인.** PWA(sw.js) 캐시 때문에 Ctrl+F5 후 .java/.pc/대용량/검색(Ctrl+F)/라인번호 직접 확인 필요. topbar(32px) 아래 host 채움 CSS 는 코드로만 확인.

## 주의/후속
- 번들 684KB — 언어팩 줄이면(html 이 css+js 끌어옴) 감량 가능. 현재는 로컬 캐시라 수용.
- 인코딩 select(UTF-8/EUC-KR)·유니코드한글변환 토글은 그대로 동작(content 생성 단계라 CM 무관).
- 다운로드는 이미 svCurrentBase64 원본 바이트 기반이라 CM 전환과 무관.
