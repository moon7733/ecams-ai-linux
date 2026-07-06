# 답변 포맷 경직성 완화 체크리스트

- [x] `to-codex.md`의 쟁점과 이전 Codex 답변을 비교한다.
- [x] 완전 자유화 대신 형식 C 추가가 더 안전한지 판단한다.
- [x] 개발자/admin용 `SYSTEM_PROMPT`에 설계/신규 요구 유형과 형식 C를 추가한다.
- [x] md/문서 산출물은 파일 생성 약속 대신 답변 본문에 제공하도록 지시한다.
- [x] enduser 지시에도 파일 생성 약속 금지를 추가한다.
- [x] 문법 검증을 실행한다.
- [x] 합의 기록을 `docs/agent-bridge/decisions.md`에 반영한다.

## 형식 C 신규 파일 첨부 (2026-07-02)

- [x] `server.js` 형식 C에 "신규 파일 첨부 규칙"(`newfile:///` 링크+코드블록 컨벤션) 추가, 파일 생성 금지 문구를 "repo 미저장" 안내로 조정.
- [x] `public/index.html` `formatContent`에 `newfile:///` 마커+코드블록 추출 패스 추가(기존 코드블록/diff 정규식은 미변경).
- [x] `buildNewFileBlock` — 절대경로 마스킹 후 "👁 보기"/"💾 다운로드" 버튼 렌더.
- [x] `svOpenVirtualFile` — 서버 호출 없이 소스뷰어(CodeMirror) 재사용해 미리보기.
- [x] `node --check server.js` 통과, 인라인 스크립트 2개 `new Function()` 문법 검사 통과.
- [x] 격리 스크립트로 정규식 5개 시나리오(정상/공백변형/마커뒤텍스트있음/마커없음/다중파일) 검증 — 그레이스풀 디그레이드 확인.
- [x] puppeteer E2E — 실행 중인 서버(pm2, `http://localhost:5000/`)에 합성 답변을 `appendMessageDOM`으로 주입해 렌더/보기/다운로드 3단계 전부 검증. 한글 라운드트립(`btoa(unescape(encodeURIComponent))`→`atob`→`TextDecoder`) 포함 통과, 페이지 에러 0건. 스크립트는 `scratch/newfile_e2e_probe.js`(미커밋).
- [ ] 실사용 검증 대기 — server.js는 pm2 재시작 필요(프롬프트 변경 반영), 모델이 실제로 `newfile:///` 컨벤션을 지키는지는 라이브에서만 확인 가능.
