# Plan — agy 단독 기본 성능 재설계

## 배경 / 범위

운영 모델은 **agy(Antigravity) print 모드 단독**이다. claude CLI(sonnet/haiku), gemini, deepseek, sonnet+haiku 2-stage 라우팅과 그 부속(`MAX_TURNS`, MCP, planner)은 전부 운영에서 쓰이지 않는 dead path다. 이번 재설계는 agy 경로의 기본 성능(응답 속도 + 답변 완결률)을 끌어올리는 것이 목표다.

## 진단 (확정 — 근거는 context-notes.md)

루트 원인은 **agy가 print 모드에서 파일검색/grep/PowerShell/DB쿼리를 백그라운드(async)로 띄우고, 결과가 오기 전에 턴을 자발적으로 종료**하는 것이다.
- bail = "I am waiting for the search..." placeholder (26~45s 낭비, `--print-timeout 5m`과 무관)
- 재시도가 풀 재실행(200s) → 한 질문 400s+
- bail이 안 나도 워크스페이스를 뒤지느라 성공 케이스도 100~210s

retrieval(키워드 vs 임베딩)은 근본이 아니라 증상 완화 수단이다.

## 후보 레버 (순서는 실험으로 확정 — 아직 commit 금지)

- **A. agy용 시스템 프롬프트 재설계** — 현재 SYSTEM_PROMPT는 claude 동기 도구 가정("Graph/Files 읽어라, Grep해라, 도구 8회")으로 agy에게 검색을 시킨다. "주입 컨텍스트로만 즉시 완결, 추가 검색 금지, 없으면 '자료 없음'"으로 전환.
- **B. `--continue` 기반 스마트 재시도** — bail 시 풀 재실행 대신 같은 대화 이어가기(`agy -c`). 백그라운드 검색 결과가 conversation state에 살아있으면 400s 꼬리를 죽인다. (결과가 프로세스와 함께 소멸하면 폐기)
- **C. buildContext retrieval 정밀도 향상(임베딩)** — 주입 컨텍스트가 agy가 검색하려는 것을 미리 덮으면 검색 욕구·bail 감소. A/B로 부족할 때의 본 빌드.
- **D. dead code 제거** — claude/gemini/deepseek/sonnet+haiku 분기 + `MAX_TURNS`/MCP/2-stage planner 제거. agy에게 가는 오해 소지 + 유지보수 부담 감소. "기본 성능" 정리의 일부.

## 목표 아키텍처 (설계 논의로 확정, 2026-06-25)

### 제약 (확정)
- 모델. **agy print 모드 단독** (답변) + **무료 Gemini 단일 키** (임베딩·되묻기). 유료 API 불가, 다중키 로테이션 폐기(Google 정지).
- 발견. 시맨틱 캐시가 옛 무효키로 죽어 있었음 → 키 교체로 복구. 로테이션 코드 제거 완료.

### 2-스테이지 파이프라인
```
[1단계 트리아지/되묻기 — 싸고 빠름 (~1.2s)]
  질문 임베딩(432ms, RETRIEVAL_QUERY)
  → 엔티티 임베딩 인덱스 코사인 → top-K 후보
  → 확신? ┬ YES → 2단계
          └ NO(모호) → flash-lite 되묻기 1문장(~0.8s, 스트리밍) → 사용자 답 → 타깃 확정 → 2단계
[2단계 답변 — agy (bail-fixed)]
  확정 타깃 → 고신뢰 정밀 컨텍스트만 주입 → agy 실행
```
- 되묻기 모델. `gemini-3.1-flash-lite`(thinking off, ~0.8s). agy/gemini CLI 아님.
- 명확한 질문은 되묻기 스킵(추가비용 0). 503/429 시 재시도 1회 → 실패면 되묻기 스킵하고 바로 agy(graceful).

### 임베딩 인덱스 (트리아지·retrieval 공용 토대)
- **소스 추출 텍스트 임베딩** (JSP UI 라벨 + JS/Java 주석 + 심볼명). wiki 아님(기능어 없음). LLM 합성 없음 → fidelity 리스크 0.
- **엔티티 단위 = 화면/JS + Servlet + Class** (코드심볼 질문 ~33% 대응).
- 하이브리드(정확 심볼매칭 + 임베딩), 버전중복 dedupe, task-type 임베딩.
- 인프라·광범위 질문 ~25%는 인덱스 대상 아님(별도).

### 고신뢰 컨텍스트 주입 (주입량 다이어트)
- 항상-주입(v2 CORE 7 무조건, graph index 전체, wiki 목록 dump) → **retrieval-주도 정밀선택**으로 교체. 이 질문에 매칭된 검증 표면 3~8KB만.
- v2 라인인용 → 메서드명 변환(D-8). "v2 절대우선 over AST" 위계 재고(D-7).

### bail 수정 (별개·필수)
- 되묻기로 타깃 좁혀도 agy가 async 검색→print 턴 자발종료 가능. Step 2 실험으로 검색금지 프롬프트 / interactive / `-c` 중 해법 확정.

## 자료 신뢰도 게이트 (Step 1 — agy 실험보다 먼저)

agy를 "자료-only"로 묶으려면 그 자료가 신뢰 가능해야 한다. 자료가 틀리면 bail이 *자신만만한 오답*으로 바뀐다(더 나쁨). agy·네트워크 불필요, 소스코드를 ground truth로 하는 spot-check.

### 1차 실측 결과 (context-notes D-7)
- AST Class/Servlet wiki. 고fidelity ✅ (SQL 글자단위 일치).
- LLM v2 도메인 사전. 내용 정확하나 **file:line 인용 ~78행 drift** ⚠️ → "인용 강제" 규칙 + 검색/bail 트리거 후보.
- getRelevantKnowledge store. 엔트리 2개, 사람 검수, 저위험 ✅.

### 게이트 결론 → 실험 전 선결
- v2 라인 drift를 통제(재생성/라인강제 해제/위계 재고)하지 않으면 agy 실험이 "프롬프트 탓 vs 자료 탓"을 분리 못 함 → 변수 오염. **게이트가 실험의 선행조건.**

## 설계를 가르는 실험 (Step 2 — 게이트 통과 후)

알려진 bail 프롬프트로 변형 3종 × n=3~5 (비결정성 대응).

1. **Baseline** — 현재 프롬프트 (bail 재현)
2. **검색금지 지시** — A의 프롬프트
3. **interactive** — 변형2를 `-p` 대신 `-i/--prompt-interactive`

추가: **`-c/--continue` 재시도 테스트** — bail 후 `agy -c "검색 끝났으면 이어서 완성해"` 완성 속도.

### 결과 → 분기

- 변형2가 bail 멈춤 → **A가 값싼 정답**. C는 증폭기, D 병행.
- 2는 bail인데 3은 안 남 → **agy를 interactive로 구동**하는 아키텍처 수정이 정답.
- 둘 다 bail → **B+C 세계**(작동하는 재시도 + 검색해도 충분히 찾을 컨텍스트).

실험 결과를 context-notes.md에 기록한 뒤 이 plan의 레버 순서를 확정한다.

## 성공 기준 (측정 가능)

- bail 발생률 ↓ (현재 실측 ~30%+ → 목표 측정 후 확정)
- 한 질문 wall-time p50 ↓ (재시도 꼬리 제거)
- 답변 완결률(섹션 0~6 + 2400자+) ↑
- 원본 워크스페이스 무수정 유지(그림자 격리 회귀 없음)
