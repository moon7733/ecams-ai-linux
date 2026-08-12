# pmsGemini UTF-8 청크 경계 디코딩 수정

## 문제

배포된 `pmsGemini.js:40`의 응답 수신부가 이렇다.

```js
let b = ''; r.on('data', c => b += c);
```

`r`에 `setEncoding`이 없으므로 `c`는 `Buffer`다. `b += c`는 청크마다 `Buffer.prototype.toString()`을
호출해 UTF-8로 개별 디코딩한다. 한글은 3바이트라 청크 경계가 문자 중간에 떨어지면 그 문자가
대체문자(U+FFFD)로 깨진다. 응답 JSON의 구조 문자는 ASCII라 `JSON.parse`는 그대로 성공하고,
문자열 값 안쪽만 조용히 손상된다. 그래서 실운영에서 분류 결과 텍스트에 `�`가 섞여 나왔다.

## 목표

`callGemini` 수신부가 청크 경계와 무관하게 원문을 그대로 복원한다.

## 방법

바이트를 다 모은 뒤 한 번만 디코딩한다.

```js
const chunks = []; r.on('data', c => chunks.push(c));
r.on('end', () => { const b = Buffer.concat(chunks).toString('utf8'); ... });
```

같은 저장소의 `pmsBridge.js:40`이 이미 chunks 배열 방식이라 스타일도 맞다.
모듈 공개 함수는 바꾸지 않는다.

## 검증

`https.request`를 스텁으로 갈아끼워 `callGemini`를 실제 경로 그대로 호출한다.
한글이 든 응답 봉투를 **모든 바이트 경계**에서 둘로 쪼개 흘려보내고, 돌아온 `text`가 원문과
같은지 확인한다. 이 테스트는 옛 코드(`b += c`)에서 반드시 실패해야 한다.
`Buffer.concat`만 따로 감싸 테스트하면 배선이 바뀌어도 통과하므로 그 방식은 쓰지 않는다.

## 범위 밖

같은 패턴의 다른 HTTP 수신부 6곳은 이번에 고치지 않고 후보로만 기록한다
(`context-notes.md` 참고). 배포·재시작도 하지 않는다.
