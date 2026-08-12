# 결정 기록 — pmsGemini UTF-8 청크 경계 디코딩

## 2026-08-12 원인 귀속

- 배포본과 로컬 `pmsGemini.js`는 동일하다(로컬 HEAD `60444d1`, CRLF 제거 후 SHA-256 일치).
- 배포 `pmsGemini.js:40`에 `setEncoding`도 `Buffer.concat`도 없다. 청크마다 문자열로 붙는다.
- 따라서 대체문자는 Gemini 응답이 아니라 우리 수신부에서 생긴다. 모델 출력 품질 문제가 아니다.

## 수정 방식 선택

- `Buffer.concat` 후 1회 디코딩을 골랐다. `r.setEncoding('utf8')`도 같은 효과지만
  `pmsBridge.js:40`이 이미 chunks 배열이라 저장소 스타일에 맞는 쪽을 택했다.
- `module.exports` 목록은 건드리지 않았다. 이 수정으로 모듈 표면이 바뀌면 안 된다.

## 테스트 방식 선택 — 왜 헬퍼 추출을 안 했나

- 처음에는 `decodeBody(chunks)`를 따로 빼서 테스트하려 했다. 버렸다.
  그 테스트는 `Buffer.concat`의 계약을 확인할 뿐이라, 수신부 배선을 옛 코드로 되돌려도 통과한다.
  회귀를 못 잡는 회귀 테스트다.
- 대신 `https.request`를 스텁으로 갈아끼우고 `callGemini`를 실제 경로로 호출한다.
  응답 봉투를 모든 바이트 경계에서 쪼개 흘려보내므로 옛 코드에서는 반드시 실패한다.
- 스텁은 URL을 인자로 받지만 로그·단언 어디에도 쓰지 않는다. URL 쿼리에 API 키가 붙는다.
- 원본 `https.request`는 테스트 종료 시 되돌린다.

## 동일 패턴 후속 후보 (이번 범위 밖, 손대지 않음)

HTTP 응답을 청크마다 문자열로 누적하는 곳이다. 같은 방식으로 깨질 수 있다.

- `clarifier.js:39`
- `entityIndexBuilder.js:165`
- `knowledgeManager.js:75`
- `pmsClassifyGemini.js:73`
- `pmsEmbedding.js:75`
- `wbsVisionTest.js:67`

`pmsClassify.js:80-81`과 `server.js`의 여러 곳은 자식 프로세스 stdout에 명시적 `.toString()`을
쓰는 다른 갈래라 목록에 넣지 않았다. 다만 stdout도 청크 경계 문제는 같으므로 별건으로 볼 값어치는 있다.

같은 파일의 `pmsGemini.js:384` `term.onData((d) => { raw += d; })`도 문자열 누적처럼 보이지만
node-pty가 이미 디코딩한 문자열을 준다. `Buffer.concat`이 그대로 적용되는 자리가 아니고 HTTP
수신부도 아니라서 이번 수정에서 제외했다.
