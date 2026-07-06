# Persona Routing Context Notes

## 결정 71 (2026-06-09) — persona 판정은 기존 userType 재사용
- 새 필드 만들지 않음. 가입 로직([server.js:358](../../server.js))이 이미 `userType` 을 `azsoft`/`customer` 로 저장 중.
- `customer` 만 enduser, 나머지(azsoft + 레거시 미설정)는 developer. 레거시 admin/ymlee 보호 + 기존 동작 불변이 목적.

## 결정 72 (2026-06-09) — persona 를 buildPrompt 한 곳으로만 (체인 오염 방지)
- advisor 권고. `getSystemPrompt()` 호출처 5곳(1615/1738/1843/1847/2121)에 persona 를 넘기면 모든 stream 함수 시그니처가 바뀜.
- 대안. system prompt 는 그대로 두고, enduser 일 때 `buildPrompt` 가 user prompt 최상단에 `ENDUSER_DIRECTIVE` 를 prepend. user prompt 후속·구체 지시가 우선되는 LLM 특성을 이용.
- 트레이드오프. enduser 에게도 개발자용 `SYSTEM_PROMPT` 전체가 system 으로 들어가 토큰이 약간 낭비됨. ENDUSER_DIRECTIVE 에 "위 답변 형식(## 0~6) 무시" 를 명시해 충돌 차단.
- 후속 최적화 여지. 효과 부족 시 `getSystemPrompt(persona)` 로 승격하고 enduser 전용 system prompt 분리 가능. 지금은 최소 변경 우선.

## 결정 79 (2026-06-09) — 답변 캐시를 persona 로 분리 (보안 블로커 수정)
- 문제. `getAnswerCacheKey` 에 persona 차원이 없어, 개발자가 물어 캐시된 답(소스/diff 포함)을 고객사 직원이 같은 질문 시 exact-key 충돌 또는 semantic match 로 그대로 받음 → ENDUSER_DIRECTIVE 우회, 소스 노출. (advisor done-check 에서 발견.)
- 수정. persona 를 캐시 차원에 일관 추가.
  - `getAnswerCacheKey(..., persona)` 해시에 포함. 캐시 entry 에 `persona` 저장.
  - 시맨틱 pool/auto-return 에서 `(v.persona||'developer') === persona` 필터.
  - `authMiddleware` 가 `session.userType` 부착 → 라우트에서 `getPersona(req.user)`.
  - `select-cache` persona 격리 검증, `feedback(bad)` 무효화 키에도 persona.
- 레거시. persona 없는 기존 entry 는 'developer' 로 간주.

## Feature 3 와의 경계
- 이번엔 톤/형식만. enduser 가 참조할 화면 가이드 주입·코드 컨텍스트 억제는 Feature 3 에서 buildPrompt 안 persona 분기로 확장.
