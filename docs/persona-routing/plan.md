# Persona Routing (사용자 유형별 응답 분기)

## 목적
접속한 사용자가 **개발자(아즈소프트 직원)** 인지 **엔드유저(고객사 직원)** 인지에 따라 LLM 응답 방식을 분기한다.
- 개발자 → 지금처럼 소스/Servlet/로직/diff 중심 분석.
- 엔드유저 → 소스 언급 없이 "화면을 어떻게 조작하는지" 절차 중심 안내.

## 판정 기준 (소속 기반, 이미 데이터에 존재)
- 가입 시 `userType` 이 자동 저장됨 — `affiliation === '(주)아즈소프트' ? 'azsoft' : 'customer'` ([server.js:358](../../server.js)).
- **`userType === 'customer'` → enduser**, 그 외(`azsoft`, 레거시 admin/ymlee 등 미설정) → **developer**.
- 레거시 계정은 자동으로 developer 로 안전하게 떨어짐 (기존 동작 불변).
- 수정 가능 — admin 이 사용자 관리에서 `userType` 을 바꾸면 persona 가 바뀜.

## 접근 방법 (advisor 권고 반영: persona 를 체인 전체에 뿌리지 않음)
- `getSystemPrompt()` 호출처가 5곳(gemini/claude/deepseek 등 각 stream 함수)에 흩어져 있어, 거기로 persona 를 흘리면 모든 stream 시그니처가 오염됨.
- 대신 **persona 를 `buildPrompt()` 한 곳으로만** 전달한다 (호출처 2곳: 일반 + agy+image).
- enduser 일 때 `buildPrompt` 가 만드는 user prompt **최상단에 ENDUSER 지시 블록을 prepend** 하여, 개발자용 `SYSTEM_PROMPT` 의 답변 형식(## 0~6)을 명시적으로 무시시키고 화면 절차 형식으로 재정의.
- persona 계산은 `runChatJob` 에서 1회 (`userId` 가 이미 흐름).

## 범위
- 이번 feature 는 **응답 톤/형식 분기까지만**. enduser 가 참조할 "화면 가이드" 지식 주입은 Feature 3(enduser-guide-rag)에서.
- enduser 인데 가이드가 아직 없으면, 코드 기반 추론을 화면 용어로 번역해 답하되 환각 금지 규칙 유지.
