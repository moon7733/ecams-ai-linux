# Checklist

## A. 공유 컨텍스트 셋업 (이번 세션)

- [x] agy CLI 인터페이스 검증 (`-p` 인라인 OK, `@경로` 우회 동작 확인)
- [x] `docs/agy-integration/plan.md` 작성
- [x] `docs/agy-integration/checklist.md` 작성 (이 파일)
- [x] `docs/agy-integration/context-notes.md` 작성
- [x] `AGENTS.md` 신규 작성 (현 CLAUDE.md 10원칙 + MEMO.md 읽기 지시)
- [x] `.claude/CLAUDE.md` 를 `@../AGENTS.md` import 한 줄로 축소
- [x] (검증) 새 클로드 세션에서 `@../AGENTS.md` import 가 실제 작동하는지 확인 — **OK**. 이 세션 시스템 프롬프트에 AGENTS.md 본문이 inline 로드됨
- [x] `.clauderules` 폐기 (`git rm` 완료, MEMO.md 읽기 지시는 AGENTS.md 0번 섹션으로 이전됨)
- [ ] (수동) 안티그래비티 새 세션 열어서 AGENTS.md 자동 로드 확인
- [ ] (선택) 사용자가 OK 하면 git commit (semantic — "공유 컨텍스트 셋업")

## B. agy 통합 (2026-06-01 오후)

- [x] `server.js` 의 모델 라우팅 분기 위치 파악 — `chat` 핸들러의 `requestQueue.add` 내부 (server.js:1961 부근, `if (model === 'gemini')` 등)
- [x] **(중요 검증) Node `spawn` 으로 agy 직접 호출** — 4종 변형 모두 silent fail (exit 0, 0B). `--log-file` 로 추적 결과 응답 streaming 직전 셧다운. 결정 11 참고
- [x] **node-pty 도입** — `npm install node-pty` (prebuilt 바이너리, 2초). probe `PROBE_OK` 7.8초 정상 수신
- [x] `runAgyOnce(fullPrompt, res, cwd, includeDirs)` 함수 추가 (server.js:1460 부근)
  - [x] 임시 prompt 파일 생성 (`scratch/agy_prompt_<uuid>.txt`, ASCII 전용)
  - [x] `pty.spawn(AGY_EXE, args, {name:'xterm-color', cols:200, rows:40, cwd, env})`
  - [x] `--add-dir` repeatable 형식으로 includeDirs 전달
  - [x] `term.onData` 누적 → `onExit` 에서 stripAnsi 후 res 로 buffered send
  - [x] 임시 파일 정리 (`fs.unlinkSync` in onExit)
- [x] `runAgyStream(prompt, res, allowedRepos)` 래퍼 (Gemini 패턴 동일 — sample_db 자동 포함, getSystemPrompt 결합)
- [x] 모델 라우터에 `model === 'agy'` 분기 추가 (server.js:1962)
- [x] `modelLabel` 에 agy 케이스 추가 (`🌌 Antigravity flash 3.5 분석 중...`)
- [x] `public/index.html` selector 에 `<option value="agy">` 추가 + 답변 라벨 (`🌌 Antigravity`) 추가
- [x] (수동) 서버 재기동 후 agy 모델 선택해 질문 1회 → 응답 정상 확인 — **2026-06-01 통과**. "사용자정보화면에서 cm_active 언제언제 변경돼?" → 마크다운 형식의 구체적 답변 (CMM0040 테이블, setUserInfo/delUserInfo SQL 쿼리, 5개 섹션 구조 분석). status noise 없음, ANSI escape 깨끗이 제거됨, 응답 품질 양호.
- [ ] (수동) 사용자가 OK 하면 git commit ("agy flash 모델 분기 추가 — node-pty 우회")

### B 후속 (수동 검증 후 처리)
- [ ] 응답 latency 비교 (Gemini 2.5 Flash 직접 호출 vs agy CLI 우회)
- [ ] agy `--log-file` 파싱으로 토큰/비용 측정 가능 여부 조사 (결정 14)
- [x] 이미지 첨부 처리 — **2026-06-01 결정 19 미지원 확정**. probe 1~4 + TUI probe 모두 실패, backend 에 vision tool 부재 확정. `runAgyStream` 진입부에 이미지 감지 → Claude 안내 가드 추가.

## C. UI 모델 selector 정리 (2026-06-01 저녁)

- [x] OpenRouter API key 호출 모델 3개 (`deepseek`, `o3-mini`, `gpt5-mini`) UI 에서 숨김 — 결정 20
- [x] `sonnet+haiku` label 의 "OpenRouter" 표기 정정 (실제는 Claude Code CLI 2회)
- [x] (수동) 서버 재기동 후 selector 확인 + agy 에 이미지 첨부 요청 → 가드 메시지 정상 표시 확인
- [x] (수동) 사용자 OK 시 git commit ("agy 이미지 가드 + UI selector 정리")

## D. 이미지 가드 2-stage 및 편의성 개선 (2026-06-01 야간)

- [x] agy + 이미지 가드 → 2-stage 흐름 (묘사 모델 연동)
- [x] 묘사 모델 Haiku → Sonnet (Haiku 한글 OCR 실패 잦음 검증)
- [x] elapsed 전체 wall time 표시 (overallStartTime 옵션 경유)
- [x] UI default 모델 agy (index.html)
- [x] PM2 재기동 완료 (PID 16672 가동 중)
- [x] git commit (단일 논리 단위) 완료 (`73e918be`)
- [ ] 후속 검증 포인트: 다음 agy + 이미지 호출 시 elapsed 가 ~60-65s 로 표시되면 전체 wall time 으로 잘 잡힌 것. 이상하게 보이면 보고.
