# Checklist

- [x] `companyIdOfRepos` / `companyNameOfRepos` 헬퍼 추가
- [x] `buildBadge(meta)` 공유 함수 추가 (모델·소요초·토큰·고객사·캐시)
- [x] 스트리밍 elapsed 핸들러를 buildBadge 로 교체 + answerMeta 캡처
- [x] `messages.push` 에 meta 포함 (스트리밍·캐시)
- [x] `appendMessageDOM(role, content, image, meta)` 시그니처 + ai 메시지 뱃지 재렌더
- [x] loadChat 호출부에 `m.meta` 전달
- [x] 캐시 경로 뱃지도 buildBadge + meta 저장
- [x] sendMessage 소프트 락 (currentChatCompanyName 비교 후 confirm→newChat)
- [x] 인라인 스크립트 문법 검증 (7블록 0 오류) — node `new Function` 파싱
