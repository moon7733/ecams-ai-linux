# Repo-map PoC 체크리스트

## Phase 0 — 합의 (2026-05-20)
- [x] 산업 조사 완료 (결정 62 — 사용자 통찰: 사전 양산 모델 막다른 길)
- [x] 패턴 선정: 추천 1 (agentic + repo-map) + Sonnet planner + Haiku executor + system.md + citation + cumulative wiki
- [x] 사용자 승인 — Haiku 환각 우려에 대한 multi-model 답변
- [x] plan.md / checklist.md 작성

## Week 1 — Repo-map 핵심 (5~7일)
- [ ] tree-sitter 설치 (npm install tree-sitter tree-sitter-java tree-sitter-javascript)
- [ ] 단순 .java/.js 파일 파싱 테스트 (1 파일 → AST 출력)
- [ ] 정의·참조 추출 패턴 정의 (Aider tree-sitter-language-pack 의 *-tags.scm 참조)
- [ ] NetworkX/그래프 라이브러리 선정 (graphology 또는 단순 자체 구현)
- [ ] Aider repomap.py 의 PageRank 알고리즘 Node.js 포팅
  - 또는 https://github.com/pdavis68/RepoMapper 코드 분석
- [ ] Pro*C regex fallback 작성 (EXEC SQL 블록 + C 함수 시그니처)
- [ ] kjbank 한 사이트 적용 → top 50 심볼 출력
- [ ] 캐싱 (mtime 추적, SQLite 또는 JSON)
- [ ] 사용자 검증: "결재 관련 핵심 함수 top 10" 떠올림 → repo-map top 50 안 들어가는지

## Week 2 — ecams-ai 통합 (5~7일)
- [x] **Day 1**: contextBuilder.js 에 feature flag (`USE_REPO_MAP=true`)
- [x] **Day 1**: preload 부분 분기 — flag on 시 repo-map 호출, off 시 기존 동작
- [x] **Day 2**: system.md 13개 규칙을 SYSTEM_PROMPT_REPO_MAP 로 흡수 + getSystemPrompt() 라우팅 (3곳)
- [x] **Day 2**: file:line citation 강제 룰 (SYSTEM_PROMPT_REPO_MAP 내장)
- [x] **검증 통과 (Day 2)**: PopApprovalInfo 질문 → **완전 정답** (5번째 시도, 결정 64)
- [x] **Day 3**: max_turns USE_REPO_MAP 모드 단축 (Sonnet 12→6, Haiku 14→8)
- [x] **Day 3**: Haiku 단독 / Sonnet 단독 UI 옵션 추가 (빠른모드 토글 무관) — server.js + index.html
- [x] **Day 3 검증 (2026-05-21)**: Haiku 단독 + USE_REPO_MAP A/B — 키 매칭 버그 발견 후 수정, **토큰 47% 절감 (565K→300K)**, 시간 -3.6%, 정확도 유지 (결정 65)
- [x] **버그 수정 (2026-05-21)**: contextBuilder.js REPO_WORKSPACE_PATH 키 슬래시 교정 + [RepoMap] 진단 로그 추가
- [x] **결정 66 완료 (2026-05-21)**: 이중 주입 차단 → 시간 -33% (66.3→44.2s), 출력 -42%, 정확도 향상 (3-layer 자연 분석)
- [x] **결정 67 완료 (2026-05-21)**: 4 모델 비교 + Sonnet+Haiku 라우팅 구현. 시간 33.8s 🏆, 정확도 양호 (JS 풍부, BE 얕음). GPT-5-mini 환각 발견. 3 버그 수정 (TOOL_PRESSURE / tool_calls 형식 / windowsHide).
- [ ] **선택**: Sonnet planner + Haiku executor 정식 분리 (axios + Anthropic API 직접, 1~2시간)
- [ ] **Day 4 (선택)**: repos.json 통합 (4→1, 사이트 단위) (결정 69)
- [ ] **Day 4 (선택)**: UI 드롭다운 정리 (layer 선택 제거)

### 결정 68 — 다도메인 5질문 × 3 모델 정량 측정 (2026-05-21 완료)
- [x] 사용자로부터 질문 셋 5개 수집 (Q0 기준선 + Q1~Q4 사용자 제공)
- [x] context-notes.md 결정 68 진입 헤더 + 질문/키워드/가설 기록
- [x] advisor 호출 — 스크립트 설계 검토 (캐시 우회, token parity, file:line 환각, 인증)
- [x] `scripts/measure-decision-68.js` 작성 — axios SSE 파싱, 3 모델 × 5 질문 직렬 실행
- [x] server.js DISABLE_ANSWER_CACHE env flag 추가 (캐시 우회)
- [x] dry-run: Q4 × Haiku 1회 SSE 파싱 검증 (run-haiku-Q4 = 42.0s/1089자/인용 6)
- [x] 본 측정 1회 (15 runs) — 첫 narration-only 발견 (Sonnet/Sonnet+Haiku 짧은 답변)
- [x] hasAnswerBody 플래그 스크립트 추가 (## OR length > 1500)
- [x] UI vs 스크립트 비교 — UI 도 narration → server-side 문제 확정
- [x] server.js MAX_TURNS_REPO_MAP.sonnet 6 → 14 (가름 측정 Q1: 144.7s 본문✓ → H1 확정)
- [x] 본 측정 재실행 (Sonnet+Sonnet+Haiku 10 runs, OpenRouter 충전 후)
- [x] server.js runDeepSeekStream turn 한계 10 → 14 (Sonnet+Haiku narration-only 버그)
- [x] Sonnet+Haiku 5 runs 재측정 (turn 14) — 5중 3 여전 narration + Q3 regression → 비결정성 확정
- [x] Q3 정성 검토 (Haiku vs Sonnet 14) — Sonnet 14 substantive depth 입증 (2-tier 정당)
- [x] answers-by-question.md 생성 (질문별 3 모델 답변 한눈에)
- [x] 결정 68 결론 → context-notes.md (3 모델 권고 + 결정 67 scope correction + 메타 교훈)
- [ ] 메모리 [[project_repo_map_poc]] 갱신
- [ ] 신규 메모리 [[feedback_evaluation_methodology]] — 3 signal 원칙 (자동 채점 한계 메타 교훈)

## Week 3 — Cumulative wiki + 정량 평가 (5~7일)
- [ ] knowledgeManager 확장 — 답변/citations/모델/시간/mtime 저장
- [ ] 유사 질문 캐시 — embedding similarity (BGE-M3 또는 단순 BM25 시작)
- [ ] cache hit 시 "이전 검증된 답변" UI 표시
- [ ] mtime drift 감지 — 인용 파일 변경 시 "재검증 필요" 경고
- [ ] 검증 질문 20개 작성 (사용자 도메인 정답 보유)
- [ ] A/B 측정: 기존 vs 추천 1 (정확도/시간/비용)
- [ ] 결과 정리 + context-notes.md 결정 63 누적

## Phase 4 — 운영 도입 (Week 4+, 사용자 결정)
- [ ] 검증 결과 검토 → Go/No-go
- [ ] feature flag default 변경 (`USE_REPO_MAP=true`)
- [ ] 기존 wiki/ 디렉토리 archive (wiki-archive-2026-05-20/)
- [ ] wiki-poc/ archive
- [ ] 운영 모니터링 — cache hit rate, 환각 빈도, 사용자 👍/👎 추이
