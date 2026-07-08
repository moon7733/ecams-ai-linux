# azbrain 승격 · 스택 이행 논의 (2026-07-07)

> 저장용 스냅샷. 아직 착수 전. 다른 작업 먼저 하고 여기서 이어서 논의한다.

## 큰 그림 (사용자 의도)

기존 eCAMS AI(고객사 소스분석·오류확인 시스템)를 **azbrain**으로 승격.
- 확장 목표. 유지보수 · 지식관리 · 히스토리관리 · 소스분석 등 다목적.
- 벤치마크. 노션 AI 대화 기능 — AI 대화를 자동분류·저장·검색.
- 궁극 목표. 사용자가 저장한 텍스트·첨부문서·이미지가 자동 분석·분류·저장되고, 필요할 때 물어보면 AI가 찾아서 답하고, 고객사 히스토리도 물어보면 답한다.

## 우선순위 (사용자가 확정한 순서)

1. **현재 eCAMS AI를 회사 표준 스택으로 이행** — 회사 신규 제품이 Vue3 + Spring Boot + PostgreSQL 로 만들어지는 중이라 현재꺼부터 정렬.
2. **azbrain 승격** — 자동분류·의미검색 지식저장소.
3. **노션형 페이지** — 블록 에디터 + AI.

## 현재 스택 진단

- Node.js / Express 모놀리스. `server.js` 2,956줄(144KB) + 도메인 로직 66개 파일.
- 핵심 자산. `wikiBuilder.js`(48KB), `repoMapBuilder`, `contextBuilder`(21KB), `graphifyBuilder`, `knowledgeManager`, `clarifier`, `dbDictionary`, `sqlParser`.
- 엔진 의존성. Gemini(`@google/generative-ai`), `tree-sitter`(소스파싱), `node-pty`(터미널), **`graphify`(자체 npm 패키지)** + `graphology`/pagerank.
- 대화기록은 현재 **localStorage 전용**(`docs/_archive/chat-history-meta`) — 서버 저장·검색 불가.
- RAG 실험 자산 보유. `enduser-guide-rag`, `semantic-caching`, `repo-map-poc`, `persona-routing`.

## 핵심 결론 — 전체 재작성(Java) 금지, 하이브리드 채택

Node 엔진을 Java로 통째 포팅하면 몇 달짜리 고위험 작업이고 새 가치는 0.
- `graphify`는 자체 패키지 + graphology 생태계라 **Java 대응물 없음 → 밑바닥 재구현**.
- `tree-sitter` Java 바인딩 미성숙, `node-pty`→`pty4j` 고통.

### 추천 아키텍처 (strangler-fig 점진 이행)

```
[Vue3 UI]  →  [Spring Boot: 인증·업무로직·PMS연동·Postgres 소유]  →  [Node 엔진: 분석·RAG·tree-sitter·graphify·Gemini]
   새로            새로 (회사 표준)                                        그대로 유지 (내부 서비스화)
```

- Spring Boot = 정문(인증·업무·PMS통합·Postgres).
- Vue3 = 새 UI(`public/index.html` 대체).
- 무거운 Node 두뇌는 내부 분석 서비스로 유지. 엔드포인트 하나씩 이행.

## ⚠️ 미해결 결정 (다음에 이걸로 갈림)

**회사 표준이 어느 쪽인가.**
- (A) "신규는 표준 스택 + PMS 연동"이 목적 → **하이브리드 최적.**
- (B) "운영에 Node 금지" 강제 조항 → 하이브리드 불가, 단계적 전체 포팅(몇 달·고위험) 감수.

→ 이 답이 나와야 1단계 착수 계획 확정.

## 정직하게 짚은 비용 2가지

1. **스트리밍 홉.** 지금 Gemini 실시간 스트리밍. 하이브리드에선 `Vue→Spring→Node→Gemini`(홉 추가) 또는 스트림만 `Vue↔Node` 직결 — 설계 결정 필요.
2. **런타임 2개 운영.** 리눅스에 Node + Java + Postgres 공존. 컨테이너/systemd로 관리.

## 단계별 계획(초안)

- **1단계 (최고 가성비, 언어 무관).** 대화 저장을 localStorage → **Postgres 서버 저장**. 재작성 결정과 무관하게 가치 있고, azbrain 지식저장소(pgvector)의 정확한 토대.
- **2단계.** Spring Boot 정문 + Vue3 UI. 인증·대화 CRUD부터.
- **3단계.** pgvector 자동분류·의미검색 → azbrain 승격. 파이프라인 = 수집(multer/officeparser/Vision) → 정규화·분류(Gemini 태깅) → 저장(Postgres+pgvector) → 검색(하이브리드: 벡터+풀텍스트).
- **4단계.** 노션형 페이지.

## 노션형 페이지 feasibility

위험한 "어려움" 아님. 시간 드는 일.
- AI·지식 절반. 이미 대부분 보유.
- 블록 에디터 절반. 밑바닥 말고 **Tiptap(ProseMirror 기반) Vue3** 사용. 몇 주 UI 작업.

## 다음 액션

- [ ] 회사 표준 조건(A/B) 확인 → 미해결 결정 해소.
- [ ] 확정되면 `docs/azbrain-migration/{plan,checklist,context-notes}.md` 생성 후 1단계(Postgres 대화저장) 착수.
