# 개발자 질문 3개 — codex(gpt-5.4-mini) vs AGY(Gemini Flash 3.5) 대조

작성 2026-07-01. 사용자 요청 — enduser 말고 **developer 페르소나** 질문으로 codex와 AGY를 같은 조건에서 대조하고, 질문·결과를 상세히 문서로 남긴다.

## 방법론

- **대상 모델.** codex = `gpt-5.4-mini`(Flash 3.5 티어 매칭, 5.5-mini 없어 5.4-mini). AGY = 기본 모델(Gemini Flash 3.5, 사용자 확인).
- **페르소나.** 둘 다 developer(agentic 소스탐색). live 탐색 그대로.
- **대상 repo.** 광주은행 `kjbank_html5`(+ sample_db 자동포함, AGY 기본동작).
- **시스템 프롬프트.** 둘 다 server.js의 `SYSTEM_PROMPT`(4076자) 동일 주입.
- **격리.** codex — 실 repo에 `--sandbox read-only --cd kjbank_html5`. AGY — 라이브 `.shadow` 안 건드리게 `scratch/agy-probe` 격리 사본(33MB)에서 `runAgyOnce`와 동일 플래그(node-pty ConPTY cols=20000).
- **러너.** `scratch/codex_probe_run.js`, `scratch/agy_probe_run.js`. **답변 원문은 `docs/gpt-exec-probe/answers/`에 보존.**

## 질문 3개

- **Q1 (수정 가이드 / 교차파일 추적).** 운영배포 신청할 때 SR에 엮인 파일을 전부 한 번에 신청하는데, 파일 단위로 신청하게 하려면 어떤 소스를 어떻게 고쳐야 해?
- **Q2 (버그·리스크 헌팅 / 광역 스캔).** 형상관리 웹소스(Java)에서 NullPointerException을 유발할 위험이 있는 코드를 찾아줘.
- **Q3 (아키텍처 매핑 / 체계적 열거·검증가능).** Cmr0200Servlet이 처리하는 requestType을 전부 정리하고, 각각 어느 Cmr0200 메서드로 분기하는지 매핑해줘.

---

## 핵심 결과 — 품질은 대등(codex가 오히려 정밀), 속도·신뢰성은 AGY 우위

2회 측정했다. **1차(초기)** codex는 3개 다 실패 — Q1 websocket 끊김, Q2·Q3 **구독 사용량 한도 초과**(무거운 Q1이 토큰 소진→계정이 리셋시각까지 잠김). **2차(한도 리셋 후 재측정)** codex는 **3개 다 성공**했고 품질이 강했다.

- **품질 = codex ≈ AGY, 일부 codex 우세.** 검증 가능한 Q2·Q3를 실제 소스와 대조한 결과 **둘 다 환각 0**. Q3 requestType 커버리지는 codex **33/33** > AGY 31/33. Q2 NPE는 codex가 3개 위치(ConnectionInitialize·LoginManager 등, 소스 실존 확인), AGY는 1개(Cmd0101, 실존 확인) — 둘 다 실제 버그.
- **속도 = AGY 압승.** codex는 live 탐색으로 전 문항 **~3.5배 느림**(Q1 337s vs 92s, Q2 232s vs 68s, Q3 165s vs 45s).
- **신뢰성 = codex 리스크.** 1차에서 드러난 **구독 사용량 한도**(무거운 질문 1~2개로 소진→계정 잠김)와 **websocket 불안정**은 멀티유저 프로덕션의 하드 관문. 2차는 리셋 직후라 통과했을 뿐, 한도 자체가 사라진 건 아니다. AGY는 무료 키로 2회 다 안정.

**결론.** codex는 **품질로는 채택 가능**하나, ①사용량 한도(멀티유저 최대 블로커) ②속도(사전주입으로 완화 가능, 별도 probe서 289→85s 확인) ③websocket 신뢰성을 풀어야 한다. 현재 종합 우위는 여전히 AGY.

---

## 결과 요약

| 질문 | codex 속도(2차) | codex 품질 (실측 검증) | AGY 속도 | AGY 품질 (실측 검증) |
|---|---|---|---|---|
| Q1 | 337.7s | ✅ 호출체인·파일 정확 추적 | **92.3s** | ✅ 호출체인 라인번호까지 + 수정지점 |
| Q2 | 232.5s | ✅ **실제 NPE 3곳**(ConnectionInitialize:55, LoginManager:138 등, 소스 실존 확인), 환각 0 | **67.9s** | ✅ 실제 NPE 1곳(Cmd0101:679) + diff, 환각 0 |
| Q3 | 165.3s | ✅ requestType **33/33** + 디스패치 정확, 환각 0 | **44.5s** | ✅ requestType 31/33, 환각 0(2개 누락) |

- **1차 codex(참고).** Q1 214.4s websocket 끊김 무출력 / Q2·Q3 5초 즉시실패 = 사용량 한도 초과. → 2차는 한도 리셋 후 재측정.
- 검증 방법 — Q3는 서블릿 `switch(requestType)` case 33개를 정답으로 대조. Q2는 지목 파일·라인을 소스에서 grep해 실존 확인. 둘 다 양쪽 모델 환각 0.
- 답변 원문 — codex [q1](answers/codex_q1.md)·[q2](answers/codex_q2.md)·[q3](answers/codex_q3.md), AGY [q1](answers/agy_q1.md)·[q2](answers/agy_q2.md)·[q3](answers/agy_q3.md).

---

## Q1 — 파일 단위 배포 신청 수정 가이드

### codex(gpt-5.4-mini) — 337.7s (2차) ✅
전문 → [answers/codex_q1.md](answers/codex_q1.md). 1차는 214s 후 websocket 끊김 무출력. 2차(리셋 후)는 `ApplyRequest.js`→`Cmr0200Servlet`→`Cmr0200.java` + allow-partial-deploy 문서까지 근거로 정확히 추적. 품질은 AGY와 대등하나 337s로 3.7배 느림.

### AGY(Flash 3.5) — 92.3s ✅
전문 → [answers/agy_q1.md](answers/agy_q1.md). 요지.
- `ApplyRequest.js`의 `cmdReqClick()`(L1584) → `chk_SrItem` Ajax → `Cmr0200Servlet` → `Cmr0200.chk_SrItem()`(L9436) 호출체인을 **라인번호까지** 추적(wiki 인덱스 활용).
- 제약 로직 정확 파악 — `cm_sysinfo` 19/26번째 글자가 `"1"`이면 "SR에 연결된 모든 프로그램을 한번에 반영" 강제, `firstGrid.list.length` vs 수정대상 수 비교.
- 수정 방향 — 클라이언트 일괄검증 분기 + 서버 `chk_SrItem` 누락검사(`CMR0020`/`CMM0020` 조인)를 완화하는 지점 제시.

### 대조
codex는 앞서 같은 파일군을 정확히 추적했으나(289s), 이번 Q1은 네트워크로 실패. AGY는 92.3s에 라인번호까지 짚어 완주.

---

## Q2 — NullPointerException 위험 코드 헌팅

### codex(gpt-5.4-mini) — 232.5s (2차) ✅
전문 → [answers/codex_q2.md](answers/codex_q2.md). AGY와 **다른 위치**의 실제 NPE 위험 3곳을 지목 — DB 연결 초기화 `ConnectionInitialize.java:55` `defaultAutoCommit_s.equals("true")`(getProperties null이면 NPE), 로그인 `LoginManager.java:138` `rs.getString("CM_ADMIN").equals("1")`(DB null이면 NPE), 세션 유틸 등. **소스 grep로 전부 실존 확인, 환각 0.** AGY보다 커버리지 넓음(공통계층까지). 단 232s로 3.4배 느림.

### AGY(Flash 3.5) — 67.9s ✅
전문 → [answers/agy_q2.md](answers/agy_q2.md). 요지.
- `Cmd0101.java`의 `get_frameworkList`에서 **`gubun.substring(0,1)`을 null 검증 없이 호출** → `gubun`이 null이면 NPE. 구체 diff 제시(`gubun != null && gubun.length() > 0` 가드 추가).
- `insCmr0020`에서 맵의 특정 키 값이 null일 때 비교 중 NPE 가능성도 지목.

### 실측 검증 (소스 대조)
- **정확함, 환각 0.** `Cmd0101.java:679` 실제 코드 = `if ("S".equals(gubun.substring(0,1)))`, 683행도 동일 패턴, **null 체크 없음** 확인. AGY diff의 라인·수정 내용이 실제 코드와 일치. 지목 파일(Cmd0101.java, Cmd0101Servlet.java) 모두 실존.

### 대조
둘 다 실제 NPE를 환각 없이 찾음. **AGY** = Cmd0101 1곳 + 적용가능한 **diff**까지(실용적). **codex** = 공통계층(DB연결·로그인) 3곳으로 **커버리지 넓음**. 품질 대등, 접근이 다름. 속도는 AGY 3.4배 빠름.

---

## Q3 — Cmr0200Servlet requestType 분기 매핑

### codex(gpt-5.4-mini) — 165.3s (2차) ✅
전문 → [answers/codex_q3.md](answers/codex_q3.md). 디스패치 메커니즘 정확 파악(JWT 체크→`switch(requestType)`→동일명 `Cmr0200` 메서드 위임→`ParsingCommon.toJson` 래핑→미존재 시 `Servlet Function Not Exists`). **requestType 33/33 전부 언급**(정답 대조), 환각 0. AGY(31/33)보다 커버리지 완전. 단 165s로 3.7배 느림.

### AGY(Flash 3.5) — 44.5s ✅
전문 → [answers/agy_q3.md](answers/agy_q3.md). 요지 — `switch(requestType)` 각 case를 `Cmr0200` 메서드에 매핑하고 역할 설명.

### 실측 검증 (소스 대조, 정답 33개)
- 정답 = `Cmr0200Servlet.java`의 `switch(requestType)` **case 33개**.
- AGY = **31개 정확 매핑**(getFileList_excel, getReqList, ... , chk_SrCheckOutCancel). **환각 0**(없는 requestType 지어내지 않음).
- **누락 2개** — `cmr0020_Insert`, `cmr0020_Delete`. (94% 커버리지)
- 결론 — 체계적 열거에서 소폭 불완전하나 정확도는 완벽.

### 대조
소스 정답(33개) 대조에서 **codex 33/33 > AGY 31/33**. 둘 다 환각 0. 이 질문은 codex가 커버리지에서 근소 우세, 속도는 AGY 3.7배 빠름.

---

## 종합 (2차 재측정 반영)

1. **품질 = 대등, codex가 검증 지표선 근소 우세.** 둘 다 3개 완주·환각 0. Q3 커버리지 codex 33/33 > AGY 31/33, Q2 NPE codex 3곳(공통계층) vs AGY 1곳+diff(실용). AGY는 diff까지 주는 실용성, codex는 커버리지·정밀성. 품질로는 codex 채택 가능.
2. **속도 = AGY 압승.** codex live 탐색 165~337s vs AGY 44~92s(~3.5배). codex는 사전주입으로 289→85s 완화 전례 있으나 별도 작업 필요.
3. **신뢰성 = codex 최대 관문.** 1차에서 **구독 사용량 한도**(무거운 질문 1~2개로 소진→계정 잠김) + **websocket 불안정** 실측. 2차 성공은 리셋 직후일 뿐 한도가 사라진 게 아님. 멀티유저 환경에선 치명적. AGY는 무료 키로 2회 다 안정.
4. **함의.** codex 채택 관문은 품질 아니라 **① 사용량 한도(멀티유저 최대 블로커) ② 속도(사전주입으로 완화) ③ websocket 신뢰성.** ①이 가장 크다. 현재 종합 우위는 **AGY**(무료·안정·빠름·환각0).

## 다음

- **codex 사용량 한도 실측** — 실제 상한(요청 수/토큰/시간창)과 멀티유저 고갈 속도. 이게 채택 가능성의 핵심. 한도가 실사용을 못 버티면 품질과 무관하게 보류.
- 채택 방향으로 간다면 — codex를 live 탐색이 아니라 **사전주입(repo-map/가이드) 아키텍처**로 붙여 속도·토큰 소모를 함께 줄이는 설계 검토.
