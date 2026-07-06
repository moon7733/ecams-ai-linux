# Candidate Cache UX Context Notes

## 결정 73 (2026-06-09) — 시맨틱 검색을 /api/chat 앞으로 이동
- 사용자 선택. 자동반환(0.95) + 후보검색 둘 다 `/api/chat` 앞쪽에서 처리.
- 이유. 후보를 "답변 스트리밍 시작 전"에 보여줘야 하므로 job 발급 전에 검색 완료 필요.
- 부수효과. 임베딩 호출이 요청당 1회로 단일화(기존엔 job 안에서 1회). job 장돌 절약.

## 결정 74 (2026-06-09) — 자동반환은 modeTag 유지, 후보만 modeTag 완화
- 자동반환(0.95). `reposKey` + `modeTag` 일치 유지 — 사용자가 Sonnet 정밀 골랐는데 Haiku 캐시답이 자동으로 나가는 것 방지(보수적).
- 후보(≥0.80). `reposKey` 만 일치, `modeTag` 무관 — 사용자가 "같은 질문인가"를 직접 고르므로 모델 격리 불필요(advisor 권고).
- 엣지. 자동반환 실패 시 0.95+ 이지만 modeTag 다른 항목은 후보 목록에 포함(sim 상한 없이 ≥0.80 으로 필터). 사라지지 않게.

## 결정 75 (2026-06-09) — 후보 id = md5 cacheKey, 선택 시 권한 재검증
- `getAnswerCacheKey` 의 md5 해시를 후보 id 로 그대로 노출(불투명, 추측 불가).
- `select-cache` 에서 캐시의 `reposKey` 가 사용자 `repos` 의 부분집합인지 검증 후 반환.

## 주의 — Feature 1(persona)과 무관
- enduser 도 캐시/후보를 동일하게 사용. persona 분기는 LLM 답변 생성 경로에만 영향.
