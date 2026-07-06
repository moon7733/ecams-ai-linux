# 되묻기 게이트 재설계 — 범위 명확도(scope-clarity) 기반 + 멀티턴 좁히기

## 배경 / 문제

현재 되묻기(triage)는 두 가지 버그가 있다.

- **버그2 (수정 완료).** "건너뛰기" 가 `forceFresh=true` 만 보내는데 서버 트리아지 게이트가 `forceFresh` 를 안 봐서 계속 다시 되물었다. → `server.js` 게이트에 `!forceFresh` 추가로 해결.
- **버그1 (이 문서 대상).** 되묻기/바로답을 가르는 유일 기준이 `top1-top2 점수 격차(gap≥0.15)` 라서 자연어 질문은 거의 항상 되묻는다(over-clarify, D-12 노트에 이미 기록된 이슈).

## 핵심 진단 (어드바이저 확인)

`gap` 은 **"어느 화면이냐"(검색 분리도)** 를 재는 축이고, 사용자가 원하는 건 **"이 질문 그대로 답할 수 있냐"(범위 명확도)** 라서 축이 다르다. 둘은 직교한다.

- 모호한데 top1만 튀면 → gap 큼 → 바로 답해버림 (원하지 않음)
- 구체적인데 비슷한 화면 둘 → gap 작음 → 되물음 (원하지 않음)

정답 신호 `hasSpecificProblem` 은 이미 만들고 있으나 게이트에서 버려지고 2단계 분기에서만 쓰인다. 이게 버그1의 본질.

## 목표 (사용자 의도)

1. 질문이 **명확하면 바로 분석**.
2. 질문이 **부정확하면, 충분히 구체적이 될 때까지 몇 번이고 되물어** 사용자가 점차 범위를 좁히도록 유도.

## 설계

### A. 게이트 축 교체 — gap → 2신호 AND (의도 명확 ∧ 대상 수렴)

즉답 조건 = **(대상이 한 화면으로 수렴) AND (의도가 행동 가능할 만큼 명확)**. 둘 중 하나라도 실패하면 clarify. 어느 신호가 실패했는지가 되묻기 유형을 결정한다.

| 의도 명확 | 대상 수렴 | 동작 |
|---|---|---|
| ✓ | ✓ | 즉답 (target=top1) |
| ✓ | ✗ ("파일 추출 동작?") | "어느 화면이요?" + 화면버튼 |
| ✗ ("결재 오류 봐줘") | 무관 | "무엇을 보고싶으세요?" 의도 좁히기 |

- **Fast-path (LLM 0회).** top1 이 강한 코드심볼 hit(`hits`/`strong` 부스트)를 가지면 = 수렴+명확 → `confident`, target=top1. (코드심볼 질문 ~33%, ~500ms 유지)
- **그 외.** flash-lite **1회** 호출로 두 신호를 **함께** 판정. retrieval 은 후보셋(top-K)만 공급, LLM 이 후보셋+질문을 보고 수렴/명확/범위밖을 모두 판정.
  - `outOfScope` (인프라·OS·일반) → `passthrough`.
  - `intentClear && targetConverges` → `confident`, target=top1.
  - else → `clarify` (실패 신호에 따라 화면버튼형 / 의도좁히기형).
- **새 점수 임계값 금지.** 수렴도를 "top1 근처 동점 개수(near-tie)" 같은 임계값으로 재면 버그1의 클러스터링 문제 재발(자연어는 다 뭉쳐 "흩어짐"으로 읽힘). 수렴 판정은 LLM 호출 안에서 후보셋을 보고 내린다. `gap`/`GAP_CONFIDENT` 1차 게이트 제거.
- **비대칭(C 연계).** round 1 = 두 신호 모두. lockedTarget 라운드 = 대상 고정이라 수렴 무의미 → **명확도만** 판정.

### B. 판정 신호 재정의 — 단일 LLM 호출이 3개 boolean 반환

`hasSpecificProblem` 프롬프트는 "구체적 **증상**이 있나" 만 봐서 기능질문("파일추출 어떻게 동작해?")을 false 로 떨군다(노트의 "기능·증상어 only ~25%" 버킷이 이 단층). 또한 "증상 있나" 는 의도 명확도만 보고 대상 수렴은 못 본다.

- flash-lite 1회가 다음 JSON 반환.
  ```
  { outOfScope, intentClear, targetConverges, clarifyQuestion, options }
  ```
  - `intentClear` — 질문이 행동 가능할 만큼 의도가 좁은가 (기존 hasSpecificProblem 을 "증상"→"행동 가능성" 으로 확장).
  - `targetConverges` — 후보셋을 볼 때 질문이 한 화면으로 좁혀지나, 여러 화면 기능인가.
  - `clarifyQuestion`/`options` — 둘 중 하나라도 false 일 때만. 어느 게 false 냐에 따라 화면버튼형/의도좁히기형.
- `[범위밖]` 문자열 hack, `hasSpecificProblem` 폐기/대체.
- **검증이 게이트 설계를 결정한다(post-hoc 체크 아님).** 실제 질문 12건(D-10) + "파일 추출" 을 `queryIndex` 에 통과시켜 top-K 점수분포를 출력하고, 각 질문에 원하는 결과(즉답/어느화면/의도좁히기/passthrough)를 손라벨한 뒤, LLM 이 그 후보셋으로 같은 split 을 내는지 확인하고 게이트를 확정한다.

### C. 멀티턴 좁히기 — clarifyTarget 경로를 blanket-skip → 재판정

현재 후보 선택 후 디테일 추가하면 `clarifyTarget` 달고 재전송 → 서버가 **트리아지 통째 스킵** → 추가 입력이 여전히 모호해도 답해버림. 즉 1라운드로 끝.

- 두 스킵 경로의 의도를 분리한다.
  - `forceFresh` (건너뛰기) = 사용자 포기 → 전체 스킵, 즉시 답. (이미 수정)
  - `clarifyTarget` (화면 고르고 디테일 추가) = **화면 잠근 채 범위 명확도 재판정**. 아직 모호하면 또 되묻고(잠금 유지), 충분히 구체적이면 답.
- `triage(repoId, question, apiKey, lockedTarget)` 에 `lockedTarget` 인자 추가. lockedTarget 있으면 retrieval/화면선택 생략, 잠긴 화면 안에서 범위 명확도만 재판정. clarify 면 같은 화면 잠근 채 재질문(후보 버튼 없이 입력만).
- clarify 응답에 `lockedTarget` 동봉 → 프론트가 다음 라운드에도 화면을 다시 잠그도록(`_pendingClarifyTarget` 재설정).

## 변경 파일

- `clarifier.js` — 프롬프트 재정의(B), triage 게이트 교체 + lockedTarget 인자(A, C).
- `server.js` — 트리아지 게이트 재구조화(clarifyTarget=재판정, forceFresh=스킵), clarify 응답에 lockedTarget 동봉(C).
- `public/index.html` — clarify 응답이 lockedTarget 가지면 화면버튼 없이 재질문 렌더 + `_pendingClarifyTarget` 재설정. 건너뛰기 시 잠긴 타깃 유지(C).

## 비목표

- gap 기반 "구체적+화면동점 → 화면버튼" 보조 경로는 이번에 안 함.
- 1b UI 대규모 개편 없음 — 기존 renderClarify/selectClarify 재활용.

## 성공 기준 (verify)

1. 코드심볼 질문(chk_SrCheckOutCancel 등) → LLM 0회 confident, 즉답.
2. 기능질문 — 한 화면이면("Cmr0200 파일추출 동작?") 즉답 / 여러 화면 기능이면("파일추출 동작?") targetConverges=false → "어느 화면이요?" 되묻기.
3. 모호질문("결재 오류 봐줘") → intentClear=false → clarify → 화면 선택 → 여전히 모호하면 또 되묻기(N라운드) → 구체화되면 답.
4. 건너뛰기 → 즉시 답, 재되묻기 없음.
5. 인프라질문("리눅스 패치") → passthrough 즉답.
6. D-10 12건 회귀 — 의도대로 split.
