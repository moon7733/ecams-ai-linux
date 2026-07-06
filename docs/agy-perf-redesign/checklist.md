# Checklist — agy 단독 기본 성능 재설계

## Phase 0. 진단 (완료)
- [x] agy 단독 파이프라인 전체 흐름 확인 (/api/chat → runChatJob → runAgyWithRetry → runAgyOnce)
- [x] prepareShadows로 agy의 wiki/indexes 접근성 검증 (닿음 — advisor 가설 반증)
- [x] agy_debug.log 실측 → 루트 원인 = async 자체검색 + print 턴 자발 종료
- [x] agy --help 플래그 확인 (-i, -c, --conversation, --sandbox)
- [x] 기존 agy-bail-retry 기록과 진단 교차 확증
- [x] plan / context-notes / checklist 작성

## Phase 1. 자료 신뢰도 게이트 (agy 실험보다 먼저 — agy/네트워크 불필요)
- [x] getRelevantKnowledge store 감사 (엔트리 2개, 사람검수, bail 0 — 저위험)
- [x] AST Class wiki fidelity (Cmr0200 SQL ↔ 소스 글자단위 일치 — 고fidelity)
- [x] LLM v2 도메인 사전 fidelity (PopApprovalInfo 로직 정확, file:line ~78행 drift)
- [x] v2 라인 drift 추가 표본 (Cmr0200 라인범위 = 무작위 drift, Cmr6000 = 메서드명 = drift무관) → 자동보정 불가 확정
- [x] v2 라인 drift 통제안 결정 → ⓐ 라인범위→메서드명 기계변환 추천 (D-8)
- [ ] ⓐ 구현: tree-sitter로 v2 `File.java:NNNN-MMMM` → `File.java:method()` 치환 스크립트
- [ ] (선택) buildPrompt 전체 출력 캡처 수단 복구 (runAgyOnce fullPrompt 덤프) — agy 실험 입력용
- [ ] "v2 절대 우선 over AST" 위계 재고 (AST가 더 정확 — D-7)

## Phase 2. 설계 분기 실험 (게이트 통과 후 — agy 스폰 필요)
- [ ] bail 프롬프트 재현 harness 작성 (contextBuilder export 활용 + buildPrompt 조립부 재현)
- [ ] 변형1 Baseline n=3~5 → bail 재현 확인
- [ ] 변형2 검색금지 지시 n=3~5 → bail 멈추는가?
- [ ] 변형3 interactive(`-i`) n=3~5 → bail 해소되는가?
- [ ] `-c/--continue` 재시도 테스트 → 검색결과 persist 여부
- [ ] 결과를 context-notes.md에 기록 → plan.md 레버 순서 확정

## Phase 3. 구현 (실험 결과에 따라 확정)
- [x] (되묻기) clarifier.js — 확신/모호/범위밖 트리아지 + flash-lite 되묻기 (D-12)
- [x] (1a) contextBuilder 첫 hop 인덱스 배선 + web_html5 가드 회귀 수정 (D-13). ⚠️ pm2 restart 후 E2E 미검증
- [ ] (1b) 멀티턴 되묻기 흐름 — /api/chat triage + clarify 응답타입 + public/index.html UI
- [ ] (A) agy용 SYSTEM_PROMPT 재설계 — 실험2 성공 시
- [ ] (B) `--continue` 스마트 재시도 — `-c` 결과 persist 시
- [ ] (interactive 전환) — 실험3만 성공 시
- [~] (C) 임베딩 retrieval — entityIndexBuilder.js 구현·검증 완료 (D-11). 소스추출 임베딩+하이브리드, 407엔티티, 검증 5/7 HIT(키워드 전멸 케이스 잡음). 남음: Servlet 매핑, 인메모리 캐시, contextBuilder/되묻기 배선
- [ ] (D) claude/gemini/deepseek dead path + MAX_TURNS/MCP/2-stage 제거

## Phase 4. 검증
- [ ] bail 발생률 / wall-time p50 / 완결률 전후 측정
- [ ] 원본 워크스페이스 무수정(그림자 격리 회귀 없음) 재확인
- [ ] 서버 재시작 후 실 UI E2E (메모리 규칙 — 재기동 후 검증 필요)
