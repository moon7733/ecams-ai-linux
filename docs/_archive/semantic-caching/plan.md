# Semantic Caching

목적: 질문의 단순 문자열 비교를 넘어 의미적으로 동일한 질문일 경우 캐시를 재사용하는 시맨틱 캐싱 도입.

## 접근 방법
- 기존 `answerCache`의 Value에 `vector` 속성을 추가.
- `app.post('/api/chat')` 시작 부분에서 Exact Match 실패 시 질문의 Embedding을 생성하고, 캐시 항목들을 순회하며 Cosine Similarity 0.95 이상인 답변 반환.
- 24시간 캐시 만료 등 기존 제약 사항은 유지하여, 시간이 지나면 캐시가 만료되는 특성도 그대로 활용.
