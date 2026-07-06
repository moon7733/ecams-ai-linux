# Web 타입 폴더명 제약 해제 계획

## 목표
`wikiBuilder.js`의 Web 타입 빌더(`makeHtml5Filter`)가 더 이상 레파지토리 폴더명(`_html5` 접미사)에 의존하지 않고, 등록 시 명시한 `type` 속성에만 의존하여 완벽히 동작하도록 수정한다.

## 대상 파일 및 수정 사항
1. **`public/index.html`**
   - 레파지토리 등록 및 조회 UI에서 단일 `Web` 타입을 `Web (HTML5)`(`web_html5`)와 `Web (General)`(`web_general`)로 분리.
2. **`server.js`**
   - `loadData()` 시점에 `LOCAL_REPOS`의 기존 데이터(`type: 'web'`)를 탐색하여:
     - 폴더명(id)이 `_html5`로 끝나면 `web_html5`로 자동 마이그레이션
     - 그 외에는 `web_general`로 자동 마이그레이션 및 저장
3. **`wikiBuilder.js`**
   - `const isHtml5 = safeId.endsWith('_html5');` 로직 제거
   - `repoType === 'web_html5'` 일 때 `makeHtml5Filter(repoPath)` 적용하도록 변경
4. **`graphifyBuilder.js` / `indexBuilder.js`**
   - Web 처리를 위한 `repoType` 검사 부분이 `repoType.startsWith('web')` 또는 명시적으로 `web_html5`, `web_general` 둘 다 처리하도록 호환성 점검.
