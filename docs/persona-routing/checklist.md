# Persona Routing 체크리스트

- [x] `getPersona(user)` 헬퍼 추가 — `userType === 'customer' ? 'enduser' : 'developer'` ([server.js:1080](../../server.js))
- [x] `ENDUSER_DIRECTIVE` 지시 블록 상수 추가 (화면 절차 중심, 소스/diff 언급 금지, 개발자 형식 무시) ([server.js:1086](../../server.js))
- [x] `buildPrompt()` 시그니처에 `persona = 'developer'` 추가
- [x] `buildPrompt()` 초입에서 enduser 면 prompt 최상단에 `ENDUSER_DIRECTIVE` prepend
- [x] `runChatJob()` 에서 `userId` 로 persona 계산
- [x] `buildPrompt` 호출 2곳(일반, agy+image)에 persona 전달
- [x] 답변 캐시 persona 격리 (결정 79) — 개발자 답(소스 포함)이 enduser 로 새지 않게
- [x] 서버 부팅 확인 (throw 없이 listen)
- [x] 커밋
- [x] **E2E 운영검증 (2026-06-29)** — customer 계정 djsun → `[Persona] enduser` 정확 분기, 소스 누출 0. (상세 enduser-guide-rag/context-notes 결정 81)
