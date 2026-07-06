# Repo-map PoC — eCAMS Agentic RAG 재설계

## 배경
wiki v2 사전 양산 모델이 본질적으로 막다른 길로 검증됨 (결정 49~61). 산업 SOTA 조사 결과 (Anthropic Claude Code, Sourcegraph Cody, Aider 등):
> 사전 양산 합성물(wiki, community summary, entity 사전) ≠ 답. 질문 시점 정확한 raw 코드 인용 + 누적 자산화 = 답.

## 목표
ecams-ai 본체의 agent 구조 유지하면서 contextBuilder 의 preload 만 Aider 식 repo-map 으로 교체. + Sonnet planner + Haiku executor + system.md + citation 강제 + cumulative wiki.

## 성공 기준
- 응답 시간 평균 **25~35초** (Sonnet 단독 60~120초 대비 절반)
- 환각률 **5% 이하** (Sonnet 단독급)
- 비용 **$0.035/질문** (Sonnet 단독의 60%)
- ecams-ai 본체 변경 최소 (contextBuilder.js, server.js 일부)
- 기존 자산 (system.md, knowledgeManager) 최대 재활용

## 비범위
- Vector DB / Hybrid retrieval (추천 2 — 별도 PoC)
- wiki v2 사전 양산 (폐기)
- Pro*C tree-sitter grammar 신규 작성 (regex fallback 으로 처리)

## 아키텍처

```
사용자 질문
   ↓
[Cumulative wiki cache] hit (30% 가정) → 즉시 (0초)
   ↓ miss
[repo-map] PageRank top 50 심볼 (100ms 캐시 hit / 30초 첫 빌드)
   ↓
[Sonnet planner — 1회] grep/read 계획 5개 이내 (5초)
   ↓
[Haiku executor — parallel tool calling] 계획 실행 (10~15초)
   ↓
[Sonnet 최종 합성] system.md 13개 규칙 + file:line 인용 강제 (10~15초)
   ↓
답변 + 사용자 👍 → cumulative wiki 자산화
```

## Phase 별 진행

### Week 1 — Repo-map 핵심
- tree-sitter 설치 (Java/JavaScript)
- Aider repomap.py Node.js 포팅 (또는 RepoMapper fork)
- Pro*C regex fallback (`EXEC SQL ... END-EXEC;` + C 함수 시그니처)
- kjbank 사이트 적용 → top 50 심볼 출력 검증

**검증 기준**: 사용자가 "결재 관련 핵심 함수 top 10" 떠올림 → repo-map top 50 안에 들어가는가?

### Week 2 — ecams-ai 통합
- contextBuilder.js feature flag (`USE_REPO_MAP=true`)
- preload 폐기 + repo-map 호출로 교체
- repos.json 4개 → 1개 통합 (사이트 단위)
- Sonnet planner + Haiku executor 라우팅
- system.md 13개 규칙을 agent system prompt 로 주입
- file:line citation 강제

**검증 기준**: PopApprovalInfo 화면 질문 시 정답 (사용자 검증 완료된 영역)

### Week 3 — Cumulative wiki + 정량 평가
- knowledgeManager 확장 (답변 + citations + mtime 저장)
- 유사 질문 캐시 (embedding similarity 0.85+)
- 인용 파일 mtime drift 감지
- 사용자 검증 질문 20개로 정량 측정 (정확도/시간/비용)

## 폴더 구조
```
c:/ecams-ai/repo-map-poc/
├── plan.md (이 파일)
├── checklist.md
├── context-notes.md
├── scripts/
│   ├── repo_map_builder.js (tree-sitter + PageRank)
│   ├── pro_c_extractor.js (regex fallback)
│   └── benchmark.js (정확도/시간 측정)
├── context/ (test repo-map 출력 저장)
└── out/ (사용자 검증 결과)
```

## 기존 자산 분류

### ✅ 유지 (재활용)
- server.js (대부분) — agent spawn 인프라
- knowledgeManager.js (👍 누적 시스템 — cumulative wiki 의 기반)
- dbDictionary.js
- screen_maps/
- **wiki-poc/system.md 13개 규칙** — agent system prompt 로 흡수
- **환각 패턴 7개 (결정 49~61)** — system.md 룰로 영구 자산화
- 검증된 7개 페이지 (PopApprovalInfo, Cmr0200 등) — cumulative wiki 시드

### ❌ 폐기 (또는 feature flag off)
- contextBuilder.js 의 preload 로직 (잘못된 화면 매칭 원인)
- wikiBuilder.js 정규식 wiki
- wikiV2Loader.js 사전 양산
- wiki-poc/out/.../batch_*.md 50 페이지 (검증 안 됨)

### 🔧 수정
- contextBuilder.js — preload → repo-map 호출
- knowledgeManager.js — 답변 자산화 확장
- server.js — 라우팅 (Sonnet planner + Haiku executor)

## 위험 요소

| 위험 | 완화 |
|---|---|
| tree-sitter Pro*C grammar 없음 | regex fallback (`EXEC SQL` 블록) |
| 첫 grep 잘못 시 cascading error | system.md "자료 없음" 규칙 + max_turns 5 |
| 누적 wiki outdated | mtime 추적 + 자동 재검증 알림 |
| ecams-ai 본체 변경 risk | feature flag (`USE_REPO_MAP=true`) 점진 도입 |
| Aider repomap.py 포팅 비용 | RepoMapper (이미 fork) 시작점 |
| Haiku 환각 | Sonnet planner+executor 패턴 + citation 강제 |

## 참조
- 산업 조사: [context-notes.md](context-notes.md) 결정 62
- 이전 PoC 회고: [../wiki-poc/context-notes.md](../wiki-poc/context-notes.md)
- Aider repomap: https://github.com/Aider-AI/aider/blob/main/aider/repomap.py
- RepoMapper (fork): https://github.com/pdavis68/RepoMapper
- Anthropic Claude Code 패턴: agentic search, no RAG
