# Enduser Guide RAG (엔드유저 화면 가이드 인제스트)

## 목적
고객사 직원(enduser)이 자연어로 "화면 사용법/오류 대처"를 물으면, 관리자가 업로드한 **사용자/운영자 가이드 문서(PPT·Word·PDF)** 를 검색해 화면 절차로 답한다.
- 콜드스타트 회피 — 좋아요 누적이 아니라 기존 문서 인제스트로 개발 완료 시점 즉시 커버.
- 불완전/오래된 가이드라도 grounding 레이어로 사용 (코드 단독 추론보다 환각↓).

## 핵심 설계 결정 (advisor 권고)
- **가이드는 별도 store** — `knowledge/<repoId>_guide.json`. 기존 QA 지식(`_knowledge.json`)과 분리.
  - 이유 1. `addKnowledge` 의 500개 초과 front-splice 가 가이드를 같은 파일에 넣으면 개발자 QA 지식을 밀어냄(knowledgeManager.js:191).
  - 이유 2. `getRelevantKnowledge`(개발자 hot path, 매 질문 실행)를 한 글자도 안 건드려 회귀 0.
  - 이유 3. add/score 경로가 어차피 다름 — 가이드는 청크 **본문**을 임베딩, 기존은 question 을 임베딩(line 178).
- **신규 함수** `addGuideChunks(repoId, source, chunks, apiKey)` / `getGuideKnowledge(question, repoIds, apiKey)`.
- **buildPrompt 배선** — `persona==='enduser'` → `getGuideKnowledge` 주입, developer → 기존 `getRelevantKnowledge` 그대로.

## 문서 파서
- `officeparser` 1개로 PDF/DOCX/PPTX 통합 시도. **설치 후 동작 검증 필수**(바이너리 파싱은 syntax/boot 로 못 잡음).
- 검증 실패 시 폴백 — `pdf-parse` + `mammoth`(docx), PPTX 는 보류.
- HWP 제외(사용자 결정).

## 인제스트 흐름
1. 관리자 메뉴에서 사이트(repo) 선택 + 문서 업로드(multer 재사용).
2. 파싱 → 텍스트 추출 → 청킹(~1000자, 문단 경계) → 각 청크 Gemini 임베딩 → `_guide.json` 저장.
3. **백그라운드 처리**(triggerIndexBuild 패턴) — 업로드 응답 즉시 반환, 임베딩은 백그라운드. 파싱 실패는 명확한 에러, store half-write/크래시 금지.

## 범위 / 커밋 분리
- 3a (backend). 가이드 store + add/get + buildPrompt 배선 + 파서 + 업로드 엔드포인트.
- 3b (frontend). 관리자 업로드 UI.
- 파서 스모크 테스트는 3a 착수 전 별도 단계.

## 보류 (deferred, not forgotten)
- enduser 의 코드 컨텍스트(wiki/repo-map) 억제 — 가이드가 빌 초기엔 코드 컨텍스트가 있어야 답이 나오므로 유지. 출력 통제는 ENDUSER_DIRECTIVE 가 담당. 가이드 충분히 쌓이면 후속으로 억제.
