# Repo-map PoC — 결정 및 그 이유

## 결정 62: 패러다임 전환 — 사전 양산 → Agentic + Repo-map (2026-05-20)

**배경**: wiki v2 PoC (Phase 0~19, 결정 1~61) 가 본격 통합 단계에서 막힘.
- 사전 양산 검증 비용을 사람에게 떠넘김
- ApprovalModal vs PopApprovalInfo 같은 entity 가정 환각 (Phase 19)
- mechanical extract preload 가 잘못된 화면 매칭 강제

**산업 조사 결과** (Agent 깊이 조사):
- Anthropic Claude Code: "We tried RAG... eventually, we landed on just agentic search... it outperformed everything by a lot."
- Sourcegraph Cody: 멀티 retriever, 단 evaluation 어려움
- Aider: tree-sitter + PageRank repo-map (인덱스 가벼움, drift 없음)
- GraphRAG: outdated, detail 약함 — **사용자 wiki v2 와 같은 막다른 길**
- Hybrid retrieval (BM25+dense+rerank): Recall@5 +39%, 단 인프라 부담

**결정**: 추천 1 (Agentic + Repo-map + Sonnet planner/Haiku executor + system.md + citation + cumulative wiki)

**근거**:
- ecams-ai 본체 agent 구조 유지 (재구축 0)
- 사용자 우려 (Haiku 환각) → Sonnet planner+executor 패턴 + system.md 13개 규칙 + citation 강제 = 환각률 5% 이하 예상
- 사용자 통찰 (레포 분리 무의미) → 사이트 단위 통합
- 사용자 시간 기준 30초 → Haiku 4.5 + parallel tool + prefetch + 캐싱 = 평균 25~35초

**예상 결과**:
- 응답 시간 평균 25~35초 (cache hit 30% 포함 시 18~25초)
- 환각률 5% 이하
- 비용 $0.035/질문 (Sonnet 단독의 60%)

**기존 PoC 자산 처리**:
- 유지: system.md, knowledgeManager, 검증된 7개 페이지, 환각 패턴 7개 룰
- 폐기: wiki v2 사전 양산 50 페이지, mechanical extract preload, wikiBuilder
- 핵심 자산: system.md 13개 규칙이 합성 wiki → agent prompt 로 흡수됨 — PoC 가치 보존

## 결정 63: Week 1 종료 — repo-map builder 검증 (2026-05-20)

**완료 작업**:
- tree-sitter Java/JavaScript 설치 + 파싱 동작 (PopApprovalInfo.js 2ms)
- repoMapBuilder.js 작성 (Aider 패턴: tree-sitter + graphology + PageRank)
- 노이즈 제거 (vendor 폴더, 짧은 함수명, utility 함수 패널티)
- 한국어 → 영문 entity 매핑 (KO_TO_EN 30+ 패턴)

**검증 결과 (kjbank 1357 파일 → 869 → 624 parsed)**:
| 질문 | Top 1 정답 | Top 10 정답 비율 |
|---|---|---|
| "결재자 변경 가능 경우" | ✅ PopApprovalInfo.updateProc | 5/22 |
| "운영배포 신청 INSERT" | ✅ Cmr0700.request_Deploy (#2) | 4/10 |
| "CMR9900 결재큐 트리거" | ✅ Cmr0508.request_Confirm | 5/10 |
| "CR_QRYCD 04 의미" | ❌ 모두 노이즈 (SQL 데이터 약점) | 0/10 |

**약점 식별**:
- SQL/데이터값 질문 (CR_QRYCD '04') — regex 추출 강화 필요 (Week 2~3 보완)
- 함수/메서드 영역은 매우 강함 (전체 질문의 70%+)

## 결정 64: Week 2 Day 1~2 통합 + 첫 검증 성공 (2026-05-20)

**통합 완료** (4파일):
- `repoMapBuilder.js` ecams-ai/ 루트로 이전 + npm 의존성 5개 설치
- `contextBuilder.js` — feature flag `USE_REPO_MAP=true` + buildContextWithRepoMap 함수, 캐시 10분 TTL
- `server.js` — SYSTEM_PROMPT_REPO_MAP 추가 (system.md 13개 규칙 흡수), getSystemPrompt() 라우팅 3곳

**5번째 시도 — 완전 정답 (Phase 19 사용자 검증과 완벽 일치)**:

질문: "결재자 정보 팝업화면에서 결재자 변경 가능 경우?"

| 정답 항목 | 1~4차 (기존/wiki v2) | 5차 (repo-map + system.md) |
|---|---|---|
| 화면 매칭 | ApprovalInfo / CopyApprovalInfoModal 잘못 | PopApprovalInfo.js ✅ |
| teamcd2 {3,4,6,7,8} | 부분/누락 | ✅ 정확 |
| reqSta='0' 운영중 | 누락 | ✅ "if (reqSta != '0') return; (223번 줄)" |
| strAdmin='Y' 관리자 | 누락 | ✅ "if (strAdmin != 'Y') return; (224번 줄)" |
| confdate 미수령 | 누락 | ✅ line 231 인용 |
| Cmr6000Servlet.updtConfirm | 잘못 (Cmm0300 인용) | ✅ "CMR9900 대결재자 UPDATE" |
| cboBlank '00'/'3'/'4' | 누락 | ✅ "대결재자 지정 — teamcd '3' 단계만" |
| BlankFg 주석 이력 | 누락 | ✅ "2019년 이후 12/18 주석처리" 발견 |
| 하위 단계 cascade | 누락 | ✅ "to_number(cr_locat)>0 이후 연쇄 UPDATE" |

**system.md 13개 규칙 효과**:
- file:line citation 강제 ✓
- 4-layer 명시 (JS/Servlet/Class/테이블) ✓
- 잠재 결함 후보 (BlankFg 이력) ✓
- 다른 화면 잘못 인용 0건 ✓

**검증된 가치**:
- ✅ **repo-map 의 Top 1 정확도가 답변 품질 결정** — PopApprovalInfo.updateProc 가 Top 1 → agent 첫 read 정답
- ✅ **system.md 가 환각 통제 + 답변 형식 강제** — wiki v2 PoC 가 만든 자산이 운영에서 직접 작동
- ✅ **사용자가 막힌 본질 (preload 잘못된 매칭 + 검증 부담) 둘 다 해결** — repo-map (정확) + cumulative wiki 예정 (자연 누적)

**현재 측정값 (Day 2 검증)**:
- 답변 정확도: **5번째 시도 만에 완전 정답** (1~4차 0%)
- 답변 형식: system.md 13개 규칙 답변에 적용
- Repo-map 빌드 시간: 10초 (첫 빌드), 캐시 hit 시 100ms

**남은 측정**:
- 응답 시간 — Sonnet/Haiku 별 측정
- 환각률 정량 (검증 질문 20개)
- 모델 라우팅 적용 시 비용

## 결정 65: repo-map 키 매칭 버그 수정 + 첫 진짜 측정 (2026-05-21)

**배경**: Day 3 종료 후 Haiku 단독 + USE_REPO_MAP=true 검증 중, 토큰 56만/68.8초 발생. 의심하여 PM2 로그 추적.

**발견 — 결정적 버그 (Day 2 검증 무효화)**:
- `contextBuilder.js:12-17` `REPO_WORKSPACE_PATH` 키 = `'moon7733_kjbank_html5'` (언더스코어)
- `repos.json` / `allowedRepos` 실제 키 = `'moon7733/kjbank_html5'` (슬래시)
- 매칭 실패 → `usedRepos=[]` → `isEmpty=true` → server.js:1010 `[Preload] 매칭 실패` 로그 + 기존 wiki/knowledge 경로 폴백
- **Day 2 "5번째 시도 완전 정답" 도 repo-map 효과 아님** — `SYSTEM_PROMPT_REPO_MAP` (system.md 13개 규칙) 단독 효과였음

**A/B 검증 (Haiku 단독, 동일 질문, 빠른모드/간결 OFF)**:

| 시험 | system.md | repo-map | 결과 |
|---|---|---|---|
| 1차 (USE_REPO_MAP=true, 버그) | ✓ | ✗ | code 0, 3890자, 565K tok, 68.8s |
| 2차 (USE_REPO_MAP=false) | ✗ | ✗ | **code 1, 252자 (도구 narration만)** |
| 3차 (USE_REPO_MAP=true, 키 수정) | ✓ | ✓ | code 0, 3883자, **300K tok**, 66.3s |

**핵심 통찰**:
1. **system.md 13개 규칙 = 정확도/포맷 핵심** — 없으면 Haiku가 길을 못 찾고 code 1 종료 (2차)
2. **repo-map = 토큰 효율 핵심** — 47% 절감 (565K → 300K), Top 95 심볼이 agent를 정확 위치로 1발 안내
3. **시간 효과 제한적** — Haiku 자체 속도 병목, 토큰 47% 줄어도 시간은 3.6%만 감소
4. **빌드 시간**: 첫 11초, 캐시 hit 100ms (10분 TTL) — 운영 적합

**수정 사항** (disk 영구):
- `contextBuilder.js:12-17` — 키를 슬래시 형식으로 교정 (`moon7733/kjbank_html5` 등)
- `contextBuilder.js:271+` — `buildContextWithRepoMap` 에 진단 로그 3종 추가 (`[RepoMap] 진입/skip/build/cache hit`)

**남은 누수 (다음 결정 후보)**:
- USE_REPO_MAP=true 여도 `[Knowledge] Injecting 2 entries (7.2KB)` 여전 주입
- server.js:1014~ `if (!usedFastMode)` 블록 — fastMode 아니면 기존 wiki 인덱스/화면맵도 prompt에 추가 (이중 주입)
- 차단 시 추가 토큰 절감 + 시간 단축 가능

## 결정 66: 이중 주입 차단 — 시간 -33%, 답변 품질 향상 (2026-05-21)

**배경**: 결정 65 후 토큰 30만 잔존 — `[Knowledge] Injecting 7.2KB` + server.js:1014~ 기존 wiki/graph/screenmap 블록이 USE_REPO_MAP=true 여도 여전히 prompt에 주입되고 있음 발견.

**수정** (server.js disk 영구):
- `server.js:1015` `if (!usedFastMode)` → `if (!usedFastMode && !(USE_REPO_MAP && preloadOK))` — 기존 wiki/graph/screenmap/menu/Graphify 블록 skip
- `server.js:1101-1105` knowledge 주입을 `if (!(USE_REPO_MAP && preloadOK))` 로 감쌈

**A/B 측정 (Haiku 단독, 동일 질문)**:

| 시험 | 시간 | 캐시 토큰 | 출력 토큰 | 답변 |
|---|---|---|---|---|
| 3차 (repo-map만 켬) | 66.3s | 300K | 7,161 | JS 레이어 깊이 분석 |
| **4차 (이중 차단)** | **44.2s (-33%)** | 292K (-2.5%) | **4,160 (-42%)** | **JS + Servlet + Java 3-layer 자연 분석** |

**핵심 통찰**:
1. **시간 -33%** — prompt 크기 감소로 첫 토큰 생성 빠름 + agent 도구 호출 효율 증가
2. **답변 품질 오히려 향상** — Knowledge 부재로 agent가 직접 Read로 Servlet/Java 추적, **3-layer 자연 분석**. 이중 주입은 token뿐 아니라 답변을 과거 형식에 가둠.
3. **토큰 카운트 미세 변화** (300K → 292K) — 캐시 hit 부분 (system prompt, tool 정의) 은 거의 동일하므로 cache 토큰은 비슷. 진짜 효과는 **출력 토큰 -42%** + 시간 단축에서 드러남.

**운영 도입 후보 자격** (Haiku + USE_REPO_MAP + 이중 차단):
- 44초 / 답변 정확 + 3-layer / 토큰 효율 / 환각 없음 — 사용자 기준 30초 목표에 근접
- Sonnet 정밀 모드 (106초) 대비 -58% 시간, 정확도 동등

## 결정 67: 4 모델 비교 + Sonnet+Haiku 라우팅 구현 (2026-05-21)

**배경**: 결정 66 후 운영 모델 결정 위해 3가지 비교 (Haiku/Sonnet/Sonnet+Haiku) + GPT-5-mini 호기심 시도.

**구현 — Sonnet planner + Haiku executor 라우팅** (server.js 영구):
- `runDeepSeekStream` 시그니처에 `plannerModelId` 추가
- turn 1 = planner, turn 2+ = executor (OpenRouter via `anthropic/claude-sonnet-4.6` + `anthropic/claude-haiku-4.5`)
- UI 옵션 `🎯 Sonnet → Haiku 라우팅` 추가 (index.html)

**시행착오 디버그 (3가지 버그 발견·수정)**:
1. **GPT-5-mini 진단 정정** — server.js:1535 `isReasoningModel` 가 tools 자체를 안 보냄 (과거 우회). 사용자 보기엔 "도구 회피" 였지만 실은 코드가 막은 것. system.md/TOOL_PRESSURE 모두 무력. 운영 후보 제외.
2. **TOOL_PRESSURE 부작용** — Anthropic 모델이 "도구 호출 없는 답은 거짓" 을 문자 그대로 지켜 무한 도구 호출. 제거.
3. **assistant tool_calls 형식 버그 (진짜 root cause)** — `{id, name, arguments}` 평면 push → OpenRouter via Anthropic 매칭 실패 → 무한 루프. `{id, type:'function', function:{name, arguments}}` OpenAI 표준으로 수정 → turn 5 에 정상 답변.

**A/B 측정 (Haiku 단독, 동일 질문, USE_REPO_MAP=true + 이중 차단)**:

| | Haiku 단독 (4차) | Sonnet 단독 (5차) | **Sonnet+Haiku (11차)** | GPT-5-mini |
|---|---|---|---|---|
| 시간 | 44.2s | 80.0s | **33.8s** 🏆 | 14s (환각, 실패) |
| 토큰 (캐시) | 292K | 196K | 미측정 | 미측정 |
| 출력 토큰 | 4,160 | 4,500 | 3,777 (PM2) | 2,229 (환각) |
| 정확도 | JS+Servlet+Java 3-layer | + 잠재결함 발견 | JS 풍부, BE 얕음 | 환각 file:line |
| 비용 (대략) | $$ | $$$$$ | $$$ | $ |

**핵심 통찰**:
1. **Sonnet+Haiku 시간 최단 (33.8s)** — Sonnet 의 정밀 plan (1턴) + Haiku 빠른 실행 (4턴) = 5턴 완성
2. **Sonnet 단독 = 깊이 최우수** — 잠재결함 (서버 권한 재검증 부재, cr_cr_status 오타 의심) 발견
3. **Haiku 단독 = 자체 시행착오로 3-layer 자연 도달** (JS+Servlet+Java)
4. **GPT-5-mini = 환각 file:line 인용** — 운영 위험. tools 차단된 상태에서도 추가로 모델 자체 부적합

**운영 모델 권고**:
- 기본 (일상) = Sonnet+Haiku (속도+가성비, JS layer 중심 질문)
- 깊이 (보안/결함) = Sonnet 단독
- 백엔드 cross-layer = Haiku 단독 (자체 시행착오로 layer 추적)
- GPT-5-mini = 제외

**부수 개선 (모든 spawn windowsHide:true)**:
- graphify/gemini/claude/grep — 모든 spawn 에 windowsHide:true 추가 (cmd 창 깜빡임 제거)
- 속도 효과는 미미 (단 grep_search 다회 호출 시 시각 개선 큼)

## 결정 68: 다도메인 5질문 × 3 모델 정량 측정 — 진입 (2026-05-21)

**목적**: 결정 67 의 운영 모델 권고 (기본=Sonnet+Haiku / 깊이=Sonnet / BE cross-layer=Haiku) 를 다양한 도메인 질문에서 검증. 특히 Sonnet+Haiku 의 BE 깊이 약점 (결정 67 "JS 풍부 / BE 얕음") 이 실재하는지, 또 다른 모델 약점 (환각, 누락) 이 도메인 별로 어떻게 분포하는지 정량화.

**측정 셋업**:
- 모델 3종: `haiku` / `sonnet` / `sonnet+haiku` (GPT-5-mini 는 결정 67 환각 발견으로 제외)
- 공통 조건: `USE_REPO_MAP=true`, 이중 주입 차단 (결정 66), 빠른모드 OFF, 간결모드 OFF
- 실행 방식: `scripts/measure-decision-68.js` (axios → /api/chat SSE 호출, 자동 직렬 실행, 결과 JSON 저장)
- 평가 방식: 하이브리드 — 자동 키워드 채점 (1차) + 사용자 최종 판정 (정성)

**질문 셋 5개** (사용자 제공, 도메인 정답 보유):

| # | 질문 | 영역 | 정답 핵심 키워드 (자동 채점) |
|---|---|---|---|
| Q0 | (기준선) 결재자 변경이 가능한 경우는 언제야? | JS 화면 깊이 | `PopApprovalInfo`, `updateProc`, `teamcd2`, `reqSta`, `strAdmin` |
| Q1 | 운영배포신청화면에서 "체크아웃취소 된 프로그램" 알럿창이 왜 뜸? | JS → SQL 다층 | `chk_SrCheckOutCancel`, `Cmr0200`, `체크아웃취소 이력`, `sr+` 또는 `SR` 테이블 |
| Q2 | 25년 운영배포 신청 완료건 결재라인 SELECT 쿼리 (팀장 41 / 부장 31 / PL 54 / 개발품질 92) | pure DB + 코드 매핑 | `cmr1000`, `cmr9900`, `cr_team`, `'41'`, `'31'`, `'54'`, `'92'`, `cr_qrycd`, `'04'`, `cr_confusr`, `cr_confdate`, `cr_locat != '00'` |
| Q3 | 형상관리 프로세스 흐름 — 체크아웃부터 운영배포까지, 신청건 처리 | 프로세스 도메인 | `체크아웃`, `체크인`, `테스트배포`, `운영배포`, `ecams_mgr`, `웹`/`서버` |
| Q4 | 운영적용요청상세에서 프로그램 1개만 회수 가능? | UI 인터랙션 | `프로그램목록`, `우클릭`/`오른쪽`, `개별회수` |

**자동 채점 규칙**:
- 키워드 포함 = 점수 1, 누락 = 0. 질문 별 키워드 점수 합 / 키워드 수 = 0~1 정규화
- 환각 의심 (`screen_map`, `getRequestList`, `ApprovalModal` 같이 결정 67 등에서 잡힌 가짜 entity) 시 별도 플래그

**기록 항목 (질문 × 모델 별)**:
- 시간 (s), 입력/출력 토큰, 도구 호출 수, 답변 텍스트 전문, 자동 채점 점수, 환각 플래그
- 결과 → `repo-map-poc/results/decision-68/<timestamp>/run-<model>-Q<N>.json` + `summary.md`

**가설**:
- H1 (Sonnet+Haiku BE 약점): Q1/Q2 에서 Sonnet+Haiku 가 Haiku 단독 대비 키워드 누락 더 많을 것
- H2 (Sonnet 깊이 우위): Q1 의 SQL 추적, Q2 의 cr_locat 같은 미세 조건은 Sonnet 단독만 잡을 것
- H3 (Haiku 정확도): Q3/Q4 같은 짧고 명확한 질문은 3 모델 동등, 시간만 차이

## 결정 68 결론 (2026-05-21) — 3 모델 운영 권고 확정 + 결정 67 scope correction

**측정 데이터**: 3 모델 × 5 질문 (Q0 PopApprovalInfo 기준선 + Q1 chk_SrCheckOutCancel JS→SQL + Q2 cmr1000/cmr9900 SQL 작성 + Q3 형상관리 프로세스 + Q4 PopRequestDetail 우클릭). USE_REPO_MAP=true, DISABLE_ANSWER_CACHE=true, repos=kjbank 2개. **N=1 per cell — best in single measurement, not stability claim.**

### 운영 권고

| 모델 | 권고 | 평균 시간 | 정확도 | 본문 일관성 | 비고 |
|---|---|---|---|---|---|
| **Haiku (max-turns 8)** | **운영 기본** | 44.1s | 81% | 5/5 ✓ | 시간/정확도/비용 균형 최우수 |
| **Sonnet (max-turns 14)** | **정밀 옵션** | 146.6s (3.3배) | 79% | 5/5 ✓ | 인용 30.6건. Q3 비교에서 cross-layer 추가 발견 입증 (체크아웃 취소 2 진입점, ecams_mgr 폴링 SQL, 접수번호 형식 `YYYY04NNNNNN`, CR_PASSOK 우선순위 분기, CR_ECLIPSE='N' 고정) |
| Sonnet+Haiku | **운영 제외** | 39.9s | 41% | 2~3/5 ❌ | 결정 67 scope correction |
| GPT-5-mini | 제외 유지 | - | - | - | 결정 67 진단 (server.js:1530 tools 차단) |

### 결정 67 scope correction (폐기 아님)

- 결정 67 의 "Sonnet+Haiku 33.8s 🏆 운영 기본 후보" 는 PopApprovalInfo 단일 질문 (= Q0 유형, repo-map top-1 매칭으로 짧은 turn 종결) 에서만 확인된 결과. 결정 68 Q0 도 26.9s/100%/본문✓로 결정 67 재현.
- 다른 도메인 질문 (Q1/Q2/Q3/Q4) 에선 narration-only / 비결정성 / 옆길 오답 노출. 5질문 전체 정확도 = 41%.

### Sonnet+Haiku 의 3 가지 실패 모드 (결정 69 디버그 대상)

1. **turn 한계** (server.js:1523 `while (turn < 10)`) — 결정 68 에서 14 로 늘림. 일부 회복 (Q4 narration→본문) but 다른 질문 (Q1/Q2) 변화 없음. Q3 는 **regression** (본문→narration). 비결정성 시사.
2. **본문✓ 도 옆길 오답** — Q4 turn=14 본문 2528자가 ExcludeApply.js (운영반영제외요청) 답함. 정답 PopRequestDetail.js (개별회수, progCncl) 와 무관. 길이/형식은 본문 통과하지만 의미 오답.
3. **OpenRouter via Anthropic stream 결함 (가설)** — max_tokens 8000 토큰 부족 / chunk drop / planner→executor 모델 swap 시 context cache 불일치. 정확한 root cause 미확인.

### 메타 교훈 (PoC 살아남는 lesson) — 자동 채점 한계

자동 채점 단독은 가짜 정답을 **양쪽 방향으로** 통과시킴:

| 케이스 | 자동 채점 | 실제 |
|---|---|---|
| Sonnet max-turns 6 Q1 (이전 측정) | **키워드 100% / 길이 181자** | narration only — 키워드가 도구 narration 안에 우연히 등장 |
| Sonnet+Haiku Q4 turn=14 (지금) | **본문✓ (2528자, ## 헤더 있음) / 키워드 0%** | 옆길 오답 — ExcludeApply.js 답함, 정답 PopRequestDetail.js 와 무관 |

**원칙**: 다음 PoC 측정엔 **3 signal** 필수
1. 키워드 매칭 (자동)
2. 본문 마커 (hasAnswerBody — `##` OR length > 1500)
3. **사용자 spot-check** (답변 내용이 정답 도메인인지 검토 — 자동화 불가)

자동 채점은 1차 스크리닝, 결론은 사람이 spot-check 한 후. 운영 도입 후엔 👍/👎 누적이 진짜 안정성 측정.

### 미해결 한계

- **Token parity**: `runDeepSeekStream` (server.js:1424) 가 OpenRouter usage 캡처 안 함 (`usage: null` 송신). Sonnet+Haiku/GPT-5-mini/DeepSeek 비용 비교 불가. 결정 69 패치 가치 있음.
- **N=1**: 각 cell 단일 측정. Q3 regression 이 비결정성 증거 — Haiku/Sonnet 14 의 "안정성" 은 측정 안 됨, 운영 모니터링 (👍/👎) 으로 확인 필요.

## 다음 결정 (Day 7~)

- **결정 69 (Sonnet+Haiku 회복 시도)** — 옵션 3가지:
  - A. claude -p 2-stage spawn 재구현 (사용자 제안, OpenRouter 의존 끊기)
  - B. OpenRouter 패치 — max_tokens ↑ + usage 캡처 + 비결정성 디버그
  - C. 포기 — Haiku/Sonnet 14 단일/2-tier 정책으로 운영 도입
- 결정 70: cumulative wiki (Week 3)
- 결정 71: 운영 도입 Go/No-go (Haiku 기본 + Sonnet 14 정밀 옵션, USE_REPO_MAP=true default)
