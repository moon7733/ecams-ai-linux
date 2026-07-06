# Checklist - AGY bail 자동 재시도

## 구현
- [x] `isAgyBail(answer)` 헬퍼 추가 (AGY_EXE 뒤)
- [x] `runAgyOnce` onExit: bail 답변은 res.write 억제 (성공 답변만 스트리밍)
- [x] `runAgyWithRetry(prompt, res, allowedRepos, overallStart, req, jobId, maxAttempts=3)` 추가
- [x] runChatJob AGY 분기: `runAgyStream` → `runAgyWithRetry` (이미지/비이미지 둘 다)

## 검증
- [x] `isAgyBail` 단위검증 — 실측 bail 3건 모두 true, 정상 답변(1580자) false
- [x] 문법 체크 (node -c) OK
- [ ] V1 — bail → 재시도 → 정상 답변만 노출 (캡처 프롬프트 node-pty replay 진행 중)
- [ ] V2 — 첫 시도 성공 시 재시도 없음 (지연 없음)
- [ ] V3 — 전부 bail 시 안내 메시지
- [ ] V4 — 원본 파일 미수정 유지
- [ ] 서버 재시작 후 실 UI E2E (사용자)

## 정리
- [ ] 임시 진단(last_agy_prompt.txt 캡처) 제거 여부 결정
- [ ] context-notes 실측 기록

## 2026-07-01 개정 (Codex-Claude 합의 — timeout 분류 + 정적 안내)

### 구현안 상세화 (Claude 담당)
- [x] 근본원인 확정 — `isAgyBail`이 exitCode 무시, 300자 초과 영문 timeout garbage 통과 (실측 code=1/304.8s/3125자)
- [x] 3분류(ok/timeout/text-bail) 설계 + 4개 변경 diff 명세 (plan.md 개정 섹션)
- [x] 검증 기준·회귀 케이스(292초급 정상 답변) 정의

### 구현 적용 (Codex dead path 커밋 112f1511 완료 후 — 2026-07-01)
- [x] 변경 1 — `isAgyBail(answer, exitCode)` 확장 (한글 검사 선행 + exitCode). server.js:1830
- [x] 변경 2 — `runAgyOnce` onExit bailType 계산 + logAgy `bailType=` 필드. server.js:1930
- [x] 변경 3 — `runAgyStream` 반환 {answer, code, bailType} + 중복 에러 write 제거. server.js:1967
- [x] 변경 4 — `runAgyWithRetry` code 우선 분기 두 버킷(A: code=-1 인프라 에러 / B: code!==0 timeout 안내), text-bail만 재시도. server.js:1980

### 검증 (적용 후)
- [x] `isAgyBail` 단위 케이스표 5건 통과 (292초급 정상 답변 false 회귀 확인 포함)
- [x] `node --check server.js` OK
- [x] 커밋 — bail 4종 d8f992d7 (사용자 변경 3건 동반, 사용자 C 선택)

### 2026-07-01 fix A — 느린 text-bail 가드 (커밋 6779decd)
- [x] 신규 리스크 발견 — code=0/300s+/37자 6건이 text-bail 재시도로 최악 15분
- [x] 사용자 결정 — SLOW_BAIL_MS=180s(3분)
- [x] runAgyStream durationMs 반환 + runAgyWithRetry 버킷 C
- [x] SCOPE_GUIDE 상수화·문구 완화("제시간에")
- [x] 제어흐름 7/7(경계 179/180s 포함) + node --check OK
- [x] 커밋 6779decd (단일목적 diff)

### E2E — 서버 재시작(`pm2 restart ecams-bot`) 후, 5버킷 (사용자)
- [x] ok — 정상 질문이 재시도 없이 통과 (회귀 방지). 2026-07-01 사용자 실사용에서 답이 계속 정상으로 옴 → 회귀 없음 확인.
- [~] timeout(code=1) — 강제 재현 안 됨(AGY 비결정, 정상 답만 옴). **실사용 중 timeout 발생 시 SCOPE_GUIDE 정상 노출되면 확인 완료로 간주**(사용자 결정 2026-07-01).
- [~] slow-bail(code=0·3분+) — 동일. 재현 안 됨. **실사용 timeout 발생 시 확인 완료로 간주**. ← 이번에 바뀐 것, 라이브 관찰 대기.
- [~] fast text-bail — bail 자체가 드물어 재현 안 됨. 실사용 관찰 대기.
- [ ] 원본 파일 미수정 유지 (별도 확인)
