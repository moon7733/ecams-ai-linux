# Candidate Cache UX (후보선택 시맨틱 캐시)

## 목적
유사도 0.95 미만이라 자동반환되지 않는 과거 질문들을, 사용자에게 **후보로 보여주고 직접 고르게** 한다.
- 사용자가 "같은 질문"을 직접 판별 → 캐시 적중률↑, 불필요한 LLM 호출↓.
- 다른 질문이면 원래대로 LLM 분석.

## 기존 구조 문제 (advisor 지적)
- 시맨틱 검색이 `runChatJob` 안([server.js:2253] 부근)에서 돌아 — 이미 jobId 발급 후 스트리밍 시작 시점.
- 후보를 "답변 시작 전에" 고르게 하려면 검색이 `/api/chat` 응답 전에 끝나야 함.

## 접근 방법
1. **시맨틱 검색을 `/api/chat` 앞으로 이동** (exact match 옆). 임베딩 1회로 자동반환 + 후보 동시 처리.
   - 자동반환: `reposKey` + `modeTag` 일치, sim ≥ 0.95 → `type: 'cached'` 즉시 반환 (보수적, 모델 정밀도 보존).
   - 후보: 자동반환 실패 시 `reposKey` 일치(modeTag 무관), sim ≥ 0.80 상위 N개 → `type: 'candidates'` 반환.
2. **`runChatJob` 의 시맨틱 검색 블록 제거** (이중 검색 방지). job 은 캐시 저장만 유지.
3. **선택 엔드포인트** `POST /api/chat/select-cache` — 후보 id(=md5 cacheKey)로 캐시 답변 반환. 권한(reposKey ⊆ 사용자 repos) 검증.
4. **`forceFresh` 플래그** — 후보 거부 시 클라가 `/api/chat` 재호출(캐시·후보 스킵 → job 발급).

## 응답 프로토콜 (신규)
- `{ type: 'candidates', candidates: [{ id, question, sim }] }` — sim 은 0~100 정수.
- 후보 id 는 불투명 md5. 클라는 candidates 로 받은 id 만 알 수 있음.

## 프론트 (public/index.html)
- `sendMessage` 응답 처리에 `type: 'candidates'` 분기 추가 → 채팅에 후보 버튼 목록 + "모두 새 질문 (새로 분석)" 버튼 렌더.
- 후보 클릭 → `select-cache` 호출 → 기존 `type:'cached'` 렌더 재사용.
- "새로 분석" → `sendMessage(forceFresh=true)`.

## 임계값 (상수로 분리, 튜닝 가능)
- `SEMANTIC_AUTO = 0.95`, `SEMANTIC_CANDIDATE_MIN = 0.80`, 후보 최대 5개.
