# Context Notes

## 결정
- **저장 위치: 메시지 단위** (사용자 선택). 대화 단위가 아니라 답변마다 `meta.company` 를 둔다. 이유. 히스토리를 오가며 옛 대화에 이어 물을 때 각 답변의 고객사 출처가 보여야 헷갈리지 않음.
- **소프트 락** (사용자 선택). 하드 차단/자동 새대화 대신, 다른 고객사 선택 시 confirm 경고만. 비교 목적 혼용 여지를 남김.
- 대화의 "확정 고객사" = `messages` 중 첫 `meta.company` 보유 메시지의 값 (`currentChatCompanyName`). 첫 답변 전(유저 메시지만)에는 null → 락 미적용, 첫 전송이 고객사를 확정.

## 메시지 meta 스키마
```
{ role:'ai', content, meta: { model, seconds, usage, company, cache? } }
```
- `cache:true` 면 모델 라벨 대신 "⚡ 캐시 응답" 표시.
- 유저 메시지는 meta 없음.

## 근거 코드 위치 (수정 전 기준)
- 뱃지 생성/DOM 추가: index.html 4142-4164 (elapsed 핸들러)
- 스트리밍 messages.push: 4278
- 캐시 렌더/푸시: renderCachedAnswer 4642-4687 (뱃지 4652, push 4685)
- 재렌더: appendMessageDOM 3643-3657, loadChat 호출부 3595
- 로그인 시 첫 고객사 자동선택: 2396-2403 (설계가 이미 한 대화=한 고객사 지향)

## 하위호환
기존 meta 없는 대화는 buildBadge(null)→'' 로 뱃지 없이 본문만. currentChatCompanyName→null 로 락 미적용.
