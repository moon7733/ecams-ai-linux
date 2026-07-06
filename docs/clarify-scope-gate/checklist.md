# 되묻기 게이트 재설계 — 체크리스트

## 0. 사전 (완료)
- [x] 버그2 — server.js 트리아지 게이트에 `!forceFresh` 추가 (건너뛰기 무한 되묻기 해결)

## 0.5. 실측 — 게이트 설계 확정 (완료, CN-8~10)
- [x] Phase 1 retrieval 분포(scratch/clarify_retrieval_probe.js) → 점수 게이트(gap/near-tie) 사망 확인
- [x] Phase 2 LLM 3-boolean(scratch/clarify_llm_probe.js) → action 5/6, 설계 확정
- [x] 결론 — 게이트 = 코드심볼 fast-path + LLM 3-boolean. 점수 임계값 게이트 없음. 라벨은 비전제조건
- [ ] (라벨 UX) loadAliases — 화면명 `/작성자|작성일|버전\s*:/` 거부 → 코드명 폴백 (~5줄, 버튼 노출만 차단)

## 1. 판정 신호 재정의 (clarifier.js, 설계 B)
- [x] judgeGate 프롬프트 — 3 boolean: `intentClear`/`targetConverges`/`outOfScope` + clarify/options
- [x] `[범위밖]` 문자열 hack, `hasSpecificProblem`, generateClarify 제거/대체

## 2. 게이트 축 교체 (clarifier.js, 설계 A)
- [x] fast-path — symbolConverges(top1 단독 코드심볼) → confident (LLM 0회)
- [x] 2신호 AND 분기 — outOfScope→passthrough / (intentClear ∧ targetConverges)→confident / else→clarify
- [x] gap/GAP_CONFIDENT 게이트 제거

## 3. 멀티턴 좁히기 (clarifier.js + server.js + index.html, 설계 C)
- [x] triage(repoId, question, apiKey, lockedTarget) — locked 시 judgeLocked 로 의도만 재판정(retrieval 생략)
- [x] server.js — clarifyTarget 있으면 locked 재판정(forceFresh 만 전체 스킵)
- [x] clarify 응답에 `lockedTarget` 동봉
- [x] index.html renderClarify — lockedTarget 시 버튼없이 입력유도 + `_pendingClarifyTarget` 재설정 / selectClarify 단순화
- [x] index.html 건너뛰기 — locked 면 그 타깃으로 즉답

## 3.5 라벨 UX
- [x] entityIndexBuilder isGarbageLabel — loadAliases 빌드시 거부 + queryIndex 읽기시 폴백 + clarifier.lookupLabel

## 4. 검증 (AGENTS.md §8)
- [x] E2E (scratch/clarify_e2e_probe.js) 4케이스 — fast-path/round1 clarify/locked 구체→즉답/locked 모호→재되묻기 전부 통과
- [x] 서버 기동 + 브라우저 UI 멀티턴 (사용자 확인 완료)
- [x] 후속 수정 사용자 확인 완료 — CN-15(새 대화 repo 리셋) + CN-16(intent-only history 멀티턴 + backstop cap)

## 5. 마무리
- [x] context-notes 결정 기록 (CN-1~10)
- [ ] semantic commit
