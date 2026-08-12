# 체크리스트 — pmsGemini UTF-8 청크 경계 디코딩

- [x] 원인 확정. `pmsGemini.js:40`의 청크별 문자열 누적을 대체문자 발생 지점으로 확인한다.
- [x] `callGemini` 수신부를 `Buffer.concat` 후 1회 디코딩으로 바꾼다.
- [x] `pmsGemini.test.js`에 `https.request` 스텁을 두고 모든 바이트 경계 분할 회귀 테스트를 넣는다.
- [x] 옛 코드에서 그 테스트가 실패하는지 확인한다(테스트가 실제로 회귀를 잡는지 검증).
      `cut=46`에서 본문 불일치로 실패했다. 4개 중 2개 실패, 수정 후 4개 통과.
- [x] `node --test pmsGemini.test.js pmsCodeSearch.test.js permissions.test.js` 통과 (12/12).
- [x] `git diff --check` 통과.
- [x] 스테이징 목록에 `AGENTS.md`가 없는지 확인한다.
- [x] 동일 패턴 6곳을 `context-notes.md`에 파일·행으로만 남긴다.
- [x] 로컬 커밋만. push·배포·재시작 없음.
