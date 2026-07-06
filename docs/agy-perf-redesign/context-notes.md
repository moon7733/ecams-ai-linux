# Context Notes — agy 단독 기본 성능 재설계

## 결정 / 근거 (시간순 append)

### D-1. 범위를 agy 단독으로 확정 (사용자 지시)
- 사용자. "클로드 cli관련은 다빼고 다시 확인해, 오직 agy 프린트 모드만 사용중이야."
- 따라서 server.js의 claude(sonnet/haiku)·gemini·deepseek·sonnet+haiku 분기와 `MAX_TURNS`/`MAX_TURNS_REPO_MAP`/MCP/planner는 운영 dead path. 분석·재설계는 agy 경로만 대상.

### D-2. agy는 wiki/indexes에 닿을 수 있다 (코드 검증 — advisor 초기 가설 반증)
- advisor 초기 가설. "agy가 wiki에 못 닿아 주입 컨텍스트가 유일한 소스." → **반증됨.**
- 근거. [prepareShadows](../../server.js) (server.js:1686) 가 선택 repo + 해당 은행의 `wiki/`·`indexes/`를 `.shadow/`로 robocopy /MIR 미러하고, `.shadow/wiki`·`.shadow/indexes` 루트를 `--add-dir`로 넘긴다. → agy는 주입 컨텍스트 외에 **스스로 wiki/소스를 검색할 수 있는** 상태.
- 검증 경로(prepareShadows + 로그 읽기)는 advisor 제안이 맞았고, 그게 진짜 병목을 드러냄.

### D-3. 진짜 병목 = agy의 async 자체검색 → print 턴 자발 종료 (로그 확정)
- [logs/agy_debug.log](../../logs/agy_debug.log) tail 실측.
  - ttfb 항상 0.1s (콜드스타트 문제 없음).
  - bail 4건. 02:17(35s,117자 "waiting for the file search"), 04:00(45s,112자 "background search"), 07:43(26s,78자 "PowerShell 검색 백그라운드"), 08:02(210s,199자 "DB query to execute").
  - promptLen 35000~45000 (컨텍스트 충분히 주입됨)인데도 자체검색 발생 → 검색이 주입 부재 때문만은 아님.
  - 08:02 bail(210s) → 08:06 재시도 성공(205s) = 한 질문 400s+.
- `--print-timeout 5m`인데 bail은 26~45s → **타임아웃이 아니라 agy가 백그라운드 검색 띄우고 턴을 자발 종료**하는 것.
- 기존 기록 [agy-bail-retry/context-notes.md](../agy-bail-retry/context-notes.md) 가 동일 진단 확증. "미해결/향후"에 이미. *"재시도 시 프롬프트 nudge('백그라운드 검색 말고 즉시 완료') 추가하면 성공률 오를 수 있으나, 사용자가 '그대로 재시도' 원함 → 일단 동일 프롬프트."* ← 이번 재설계가 이 보류 레버를 다시 엶.

### D-4. agy CLI 플래그 (agy --help 실측)
- `-p/--print`(단일 프롬프트 비대화), `--print-timeout`(기본 5m), `-i/--prompt-interactive`(초기 프롬프트 후 세션 유지), `-c/--continue`(최근 대화 이어가기), `--conversation <id>`(ID로 재개), `--sandbox`(터미널 제한), `--add-dir`(repeatable), `--model`, `--dangerously-skip-permissions`.
- stream-json 출력 플래그 없음 → 버퍼링 불가피(결정 5). 도구 동기화 플래그 없음.
- 함의. `-i`(세션 유지)는 async 검색 결과가 돌아올 때까지 살아있을 수 있어 bail 회피 후보. `-c`는 bail 재시도를 풀 재실행 대신 이어가기로 바꿀 후보.

### D-5. agy 검색 억제 가능성은 미측정 (poll 말고 measure)
- 사용자 기억. "정확히 기억 안 나는데 자체 검색을 했던 것 같다." → 단, 이 기억은 **검색을 시키는 현재 프롬프트** 하의 동작이라 "검색 금지" 프롬프트 동작에 대한 증거가 아님.
- advisor. "Lever A는 unlikely가 아니라 untested. 반대 지시 하의 데이터점으로 A를 깎지 말 것. 사용자에게 더 묻지 말고 측정하라."
- → plan.md의 Step 1 실험으로 측정. 사용자 질의 종료.

### D-6. 자료 신뢰도 게이트 우선 (사용자 지적 — 방법론은 advisor 교정)
- 사용자. "agy가 주어진 자료로만 답하더라도 그 자료가 정말 신뢰도 있는 자료가 맞는지 먼저 테스트해야 하는 것 아니냐."
- 정당함. 자료가 틀리면 "검색 억제 + 자료 의존"은 bail을 *자신만만한 오답*으로 바꿈 → bail보다 나쁨(bail은 최소한 불완전함이 보임). 즉 **fidelity는 Lever A의 게이트.** agy·네트워크 불필요, 지금 실행 가능 → agy 실험보다 먼저.
- advisor 교정. ① 답변 로그를 ground truth로 쓰지 말 것(agy 자체검색 산물 = 순환 오염, 결정 68 재현). 깨끗한 정답은 **소스코드**. ② fidelity(wiki↔소스 일치)를 메인으로. ③ 자동채점 말고 spot-check(내가 oracle), 5문항, (a)정확성 (b)검색없이 충분성 별도 판정. ④ buildContext가 아니라 **buildPrompt 전체** 캡처(getRelevantKnowledge·동적 DB사전이 buildPrompt 레이어).

### D-7. 자료 신뢰도 게이트 1차 실측 (2026-06-25, n=3 표면)
- **(1) AST Class/Servlet wiki — 고fidelity ✅.** Cmr0200.md `chk_SrCheckOutCancel` SQL(wiki 350행)이 소스 Cmr0200.java:9664-9673과 **글자단위 정확 일치**. 파라미터 순서·코드사전(cr_qrycd='11' 체크아웃취소신청) 정확. 소스 주석은 mojibake(EUC-KR)인데 wiki는 iconv로 정확 디코드 → 오히려 가독성 향상. tree-sitter AST 파싱본이라 신뢰 가능. **메모리의 "LLM wiki 환각 7패턴"은 폐기된 카파시 wiki-PoC 얘기지 운영 wiki 아님 — 구분 필수.**
- **(2) LLM v2 도메인 사전 — 내용 정확, 인용 어긋남 ⚠️.** PopApprovalInfo_결재팝업.gpt5-mini-v3.md 주장 3건 대조.
  - `reqSta != "0"` return → wiki 인용 JS:142-146, 실제 **223행**. 로직 정확, 라인 ~80 어긋남.
  - `teamcd2 ∈ {3,4,6,7,8}` 아니면 return → 인용 JS:148-154, 실제 **226-228행**. 로직 정확, 라인 ~78 어긋남.
  - `Cmr6000Servlet`+`updtConfirm` payload → 인용 JS:106-126, 실제 **162-164행**. 정확, 라인 어긋남.
  - 결론. 로직/의미는 소스와 일치, `(자료 없음)` 정직 태깅(환각 아님). **그러나 file:line 인용이 체계적으로 ~78행 drift.** 합성 시점 다른 버전 또는 gpt5-mini 라인 환각.
  - **bail 연결 가설.** 시스템 프롬프트가 "file:line 핀포인트 인용 강제" → agy가 주입된 v2 인용(JS:142)을 열면 딴 코드 → 검증 실패 → 재검색 → bail. + v2가 "⛔ AST보다 절대 우선"인데 정작 AST가 더 정확 → 우선순위 역전.
- **(3) getRelevantKnowledge store — 저위험 ✅(현재).** moon7733_kjbank_html5_knowledge.json 엔트리 **2개뿐**, 둘 다 👍 저장(사람 검수), 벡터 있음, bail/짧음 0건. ≥7 "도구 금지" 경로는 지금 거의 안 터짐. 단 agy 답으로 채워지면 잠재 리스크.

### D-7 함의 (설계 영향)
- "agy 자료-only" 방향은 **내용 정확성 면에선 viable** (두 표면 다 content-accurate) → Lever A 리스크 ↓.
- 단 **v2 라인 인용 drift가 검색/bail 트리거 후보** → 수정 옵션. ⓐ v2 인용을 현재 소스 기준 재생성, ⓑ v2는 file-level 인용만(라인 강제 해제), ⓒ "v2 절대 우선 over AST" 위계 재고(AST가 더 정확).
- agy 실험(검색금지 프롬프트) 전에 위 인용 drift를 통제하지 않으면, 실험이 "프롬프트 탓 vs 자료 탓"을 분리 못 함 → **실험 변수 오염**. 게이트가 실험보다 먼저인 또 다른 이유.

### D-8. v2 라인 drift = 무작위(자동보정 불가), 통제안 ⓐ 메서드명 변환 (2026-06-25, 표본 +2)
- **Cmr0200_신청진입점.gpt5-mini-v3 (라인범위 인용)** vs 소스 Cmr0200.java(10377행).
  - request_Check_In/cmr1000 INSERT → 인용 3360-3480, 실제 **5408** → **+2048**.
  - request_Confirm/cmr9900 INSERT → 인용 6680-6920, 실제 6360/6380~6548 → **-300~480**.
  - CMR9900_STR 프로시저 → 인용 7160-7170, 실제 **6680** → **-480**.
  - 방향·크기 제각각 → **균일 오프셋 아님**(PopApprovalInfo의 +78과 대조). 라인번호 사실상 환각. **단 의미·구조·순서는 정확**(request_Confirm→cmr9900→CMR9900_STR 순서 일치, 메서드 전부 실재).
- **Cmr6000_결재자변경서버.gpt5-mini-v3 (메서드명 인용)**. `Cmr6000.java:updtConfirm()`, `Cmr6000Servlet.java:doPost()` — **라인 없음 → drift 무관 ✅.** v2 생성이 페이지마다 인용 스타일 불일치(라인범위 vs 메서드명).
- **결론(게이트 (a) 답).** drift 무작위 → 자동 오프셋 보정 불가. 통제안 둘.
  - **ⓐ (추천) 라인범위 → 메서드명 기계 변환.** tree-sitter로 각 `File.java:NNNN-MMMM` 감싸는 메서드 찾아 `File.java:method()` 치환. LLM 재합성 아님, 기존 AST 인프라 재활용. 10377행 파일엔 메서드명이 더 유용. Cmr6000 형식과 일관성 회복. "agy가 틀린 라인 열고→재검색→bail" 트리거를 근원 제거.
  - ⓑ 라인강제 해제(프롬프트가 v2 출처엔 file/method-level만 요구).
- **게이트 종합 판정.** 자료 *내용*은 신뢰 가능(AST 정확, v2 내용 정확, knowledge 사람검수). 유일한 실 결함은 **v2 라인 인용**이고 ⓐ로 통제 가능. → "agy 자료-only" 방향은 ⓐ 적용을 전제로 **viable**. Lever A 게이트 통과(조건부).

### D-9. 제약 확정 + 되묻기 레이턴시 실측 (2026-06-25)
- **제약. 유료 API 키 불가 — 무료 Gemini 키 1개 + HTTP 호출만.** 다중 무료키 로테이션은 Google이 정지(우회 탐지) → 폐기. server.js 로테이션 머신 전부 제거(단일 `GEMINI_KEY`), gemini_key_state.json 삭제.
- **발견 버그. 시맨틱 캐시가 운영에서 죽어 있었음.** .env 옛 키가 무효(API_KEY_INVALID) → getEmbedding 매번 실패 → 캐시 항상 miss. 정확매칭 캐시만 살아있었음. 키 교체로 복구.
- **실측 (신규 유효키, 단일 무료키, 네트워크 OK).**
  - 인증 270ms, 임베딩(embedContent) **432ms** / 3072차원 ✅. → 임베딩 지연은 비병목.
  - 되묻기 생성(generateContent). 2.5-flash **thinking ON = 4.4s**(초과), **thinking OFF = 0.95~2.8s** ✅, flash-lite = 0.96~2.7s ✅.
  - 생성 품질 양호. "결재정보 팝업에서 결재자명이 안 나오시나요?" 등 후보 화면 근거 자연어 1문장.
  - 일시 503(과부하)·429(쿼터) 가끔 발생 → 재시도 1회 + graceful fallback 필요.
- **설계 확정 사항.**
  - 되묻기 = **무료 Gemini `gemini-3.1-flash-lite` 직접 HTTP generateContent.** agy/gemini CLI 아님(에이전트 무거움). 임베딩과 같은 무료 키.
  - **모델 재선정(2026-06-25).** 처음 쓴 2.5-flash는 기존 코드 기본값 답습(구식). 실제 키 models.list에 3.x 존재. 재실측. `gemini-3.5-flash` = 503 과부하 반복(불안정, 제외). `gemini-3.1-flash-lite` = **0.73~0.83s** ✅ 빠르고 안정·품질 양호. `gemini-flash-lite-latest`(alias) = 0.9~1.1s. → 3.1-flash-lite 채택, 3.5-flash는 안정화 후 재고.
  - 되묻기 1턴 예산 ≈ 임베딩 432ms + 생성 ~0.8s = **~1.2s.** 스트리밍 시 첫 토큰 <0.5s 체감.
  - 무료 티어 신뢰성 보강. 503 재시도 1회, 실패 시 되묻기 스킵하고 바로 agy(또는 후보목록 fallback). 쿼터는 단일 키 한도 관리(임베딩+생성 같은 키 공유 부담 인지).

### D-10. 임베딩 인덱스 설계 — 실측 기반 (2026-06-25)
- **"핵심 못 찾음"의 정체 (grep 실증).** 사용자는 *기능·증상어*로 묻는데 화면명엔 그 어휘가 없음. 예. "파일추출 안돼요" → 화면명은 "개발영역연결등록"이라 글자 안 겹쳐 키워드 매칭 완전 실패. + "결재정보" → 화면 6개 모호.
- **[BLOCKING 해소] 임베딩 소스 검증.** "추출"이 어디 있나. JS **wiki** PopDevRepository.js.md = **0건**(경로·화면명·함수목록뿐). JS **소스** = 6건(파일추출 등). **JSP 소스 = 최다**(추출대상확장자·추출제외확장자 등 UI 라벨). → **wiki 임베딩=실패, 소스(특히 JSP 라벨) 임베딩=성공. LLM 합성 불필요 → v2 fidelity 리스크 회피.**
- **실패 유형 분포 (실제 질문 12건 분류).** 코드심볼 직접언급 ~33%(chk_SrCheckOutCancel, Syscom_rsrc1 커서, uploadysedrsrc) / 기능·증상어 only ~25%(파일추출, 결재자명, 파일copy) / 화면명 있음(모호·정확) ~17% / 인프라·광범위 ~25%(리눅스 패치, "서버소스 오류 뭐있어").
  - **교정.** 코드심볼이 최대 버킷 → 인덱스는 화면만이 아니라 **코드 엔티티(Servlet/Class/메서드/커서)도 포함**해야 함. (advisor "screen/JS primary" 권고를 로그 분포로 상향 조정.)
- **인덱스 설계 확정.**
  1. **임베딩 소스 = 소스 추출 텍스트** (JSP UI 라벨 + JS/Java 한국어 주석 + 심볼명). wiki 아님.
  2. **엔티티 단위 = 화면/JS + Servlet + Class.** 위 75%(심볼+기능+모호) 커버.
  3. **하이브리드.** 정확 심볼/파일명 매칭(정밀) + 임베딩(리콜) 병행.
  4. **빌드 디테일.** 버전중복(PopDevRepository vs _20231220) dedupe/최신우선. `gemini-embedding-001` task type(`RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY`) 사용(무료, 품질↑).
  5. **인프라·광범위 ~25%는 이 인덱스 대상 아님** — 별도 처리, 억지 편입 금지.
- **흐름.** 질문 임베딩(QUERY) → 엔티티 인덱스 코사인 → top-K → 확신이면 contextBuilder 체인확장(AST 충실)→agy / 모호하면 후보 화면명으로 되묻기(flash-lite).

### D-11. 임베딩 인덱스 빌더 구현 + 검증 (2026-06-25)
- **구현.** `entityIndexBuilder.js`. 인코딩 자동판별(JS/JSP=UTF-8, Java=EUC-KR — 안 잡으면 Java 임베딩 깨짐) → 엔티티 열거(wiki 정규목록 = app-only, basename 1회 walk 인덱스로 39s→63ms) → 소스(JSP라벨+JS/Java주석+심볼) 추출 → `gemini-embedding-001` task-type(DOC/QUERY) 768차원 → 디스크 캐시(증분, docHash 재사용).
- **빌드 실측.** kjbank_html5 407 엔티티(JS 213+Class 194, Servlet은 wiki명이 경로형이라 0 매핑 — 로직은 Class에 있어 v1 스킵). 402 임베딩(무료티어 429 5건 → 증분 재실행으로 메움). 275s 1회.
- **검증 (실제질문, 키워드 baseline 대비).** 매핑대상 7건 중 **top-5 HIT 5건(실질 6)**. 키워드가 전멸하던 기능어(파일추출)·코드심볼(chk_SrCheckOutCancel) 둘 다 잡음.
- **하이브리드가 필수임이 실증.** 임베딩 단독 = 3/7(코드심볼 전멸 — chk_가 Cmr0200 doc에 있어도 의미유사 이름 CheckOut이 이김). + 정확매칭 부스트 = 5/7.
  - 강매칭(코드심볼 doc 정확포함 +0.5), 약매칭(doc 희귀 한국어토큰이 질문에 등장 +0.15, **방향 반전**으로 형태소 회피: "파일추출됬는데" vs doc "파일추출"). **DF 가중**(15% 초과 등장 토큰=흔한말 스킵)으로 수정/환경 과부스트 제거.
- **남은 한계.** Syscom_rsrc1(소스에 없음=사용자 오타/범위밖) 1건만 진짜 miss. uploadysedrsrc는 심볼명 엔티티 없지만 올바른 클래스 Cmr0200 #1.
- **확신/모호 판정 = 절대점수 아닌 top1-top2 격차.** chk(137 vs 90 큰격차=확신→바로답) vs 모호화면(105 vs 102 작은격차=되묻기). 부스트 인플레는 무관(상대구조 유지).
- **미정/주의.** Servlet 매핑(경로형 wiki명). queryIndex 가 매번 loadIndex+DF재계산 → 운영은 인메모리 캐시 필요. 인프라·광범위 질문도 고점수 엔티티 표시됨(scope 판정 별도 필요).

### D-12. 되묻기(질문 명확화) 트리아지 레이어 구현 (2026-06-25)
- **`clarifier.js`.** `triage(repoId, question, apiKey)` → 4모드.
  - `confident` — 인덱스 top1-top2(버전중복 collapse 후) 격차 ≥0.15 → 타깃 확정, 되묻기 스킵.
  - `clarify` — 모호 → `gemini-3.1-flash-lite`(thinking off) 자연어 되묻기 1문장(후보 **화면명 label** 기반, 코드/파일명 비노출).
  - `passthrough` — flash-lite가 후보가 질문과 무관(인프라·OS·일반)이라 판정하면 `[범위밖]` 출력 → 되묻기 스킵 바로 답변. (LLM 자가 scope 판정, 추가 호출 없음)
  - `no_index`/`_clarifyFailed` — graceful fallback(기존 경로/바로 답변).
- **인덱스에 label 추가** — JS=화면명(ScreenMap), 그 외=엔티티명. 되묻기가 "PopApprovalInfo" 아닌 "결재정보 화면"으로 묻게.
- **실측.** 확신 515ms(generateContent 없음) / 되묻기 1.8s / 범위밖 0.95~1.3s. 전부 <2s.
  - chk_SrCheckOutCancel → 확신 Cmr0200 ✅. 결재정보 결재자명 → 되묻기(결재확인창 vs 상세요청팝업) ✅. 리눅스9.6→9.8·"서버소스 오류" → 범위밖 passthrough ✅.
- **튜닝 여지.** GAP_CONFIDENT=0.15는 보수적(임베딩성 매칭에서 over-clarify 경향, 예 파일추출이 확신 아닌 되묻기로). 안전쪽이라 일단 유지, 실사용 로그로 튜닝.

### D-13. 1a — 인덱스를 contextBuilder 첫 hop에 배선 + 운영 회귀 2건 발견 (2026-06-25)
- **🔴 발견한 운영 회귀.** buildContext가 **kjbank에서 완전히 죽어 있었음**(isEmpty=true, ctx 0자). 원인. web-type-split이 type을 web→`web_html5`로 바꿨는데 `if (repoType !== 'web') continue`(line 350) 가드를 안 고쳐 web_html5가 스킵됨. + wikiV2Loader는 옛 repoId `moon7733_kjbank_html5` 키 기대하나 실제 `kjbank_html5` 유입 → v2도 안 붙음. → **운영 agy가 타깃 선조립 0인 채로 통짜 fallback만 받고 직접 다 검색 → bail/"핵심 못 찾음"의 큰 원인.** (시맨틱 캐시 죽음 D-9에 이은 2번째 회귀.)
- **전체 repo type 감사(사용자 요청).** web 소스 = `web_html5`(4)·`web_general`(4) 둘 다 web 시작. non-web = server/db/plugin_*. → `startsWith('web')` 가 정답(미래 web_* 자동포함, 화이트리스트보다 강건). +wikiRoot 존재 2차 가드.
- **1a-1.** line 350 `!repoType.startsWith('web')` 로 수정 → buildContext kjbank 부활(ctx 50~76KB). 단 키워드 첫 hop은 여전히 부정확(결재자명→엉뚱한 ApprovalInfo, 기능어만 질문→[] 완전실패).
- **1a-2.** `selectJsViaIndex` — buildContext 첫 hop을 `findMatchingJsFiles`(키워드) 대신 `entityIndex.queryIndex`(인덱스) 우선, 실패 시 키워드 fallback. apiKey를 buildPrompt→buildContext 배선. 인덱스 파일 실 repoId 키(kjbank_html5)로 복사. loadIndex 인메모리 mtime 캐시(4.3MB 매요청 파싱 방지).
- **검증 (buildContext hits 비교).** 결재자명: 키워드 ApprovalInfo(엉뚱) → 인덱스 **PopApprovalInfo** ✅. 기능어만("어제는 파일추출됬는데"): 키워드 **[] 완전실패** → 인덱스 **PopDevRepository** ✅. 버전중복도 dedupe.
- **미검증/주의.** ⚠️ E2E(실 agy 답변이 새 컨텍스트로 개선되는지) 미검증 — **pm2 restart 후** 실 UI 확인 필요. 코드심볼 질문은 Class가 top이라 JS-centric 체인이 못 받음(Class 직접주입은 후속). 다른 web repo는 인덱스 미빌드 → 키워드 fallback.

### D-14. Codex-Claude 합의 — bail 판정 기준 갱신 (2026-07-01)
- Claude Code 검토로 최근 timeout 실패 경로를 확정했다. `exitCode=1`인 AGY timeout이 3125자 영문 계획 출력 때문에 기존 `isAgyBail`의 `>300자` 정상 판정을 통과했고, `/api/chat` 최종 답변으로 노출됐다.
- 이전의 길이+문구 기반 bail 판정은 부족하다. `exitCode`와 한글 유무를 `isAgyBail` 판정에 포함해야 한다.
- `--print-timeout 5m`은 유지한다. 292초 정상 한글 답변이 있어 per-attempt timeout 단축은 정상 성공을 죽일 수 있다.
- 대신 `runAgyWithRetry` 전체 wall-clock 예산을 둔다. timeout 실패는 nudge 재시도보다 명확한 실패 안내가 맞다.
- 아직 사용자 결정이 필요한 값은 전체 예산 6분 또는 7분, timeout 안내를 clarifier 되묻기로 연결할지 정적 문구로 둘지다.

### D-15. timeout 안내 정책 확정 (2026-07-01)
- 사용자는 첫 AGY 시도가 5분 안에 정상 답변을 못 내고 timeout으로 종료되면, 재시도하지 않고 질문 범위를 좁혀달라는 안내를 반환하는 정책을 승인했다.
- 이 정책은 `code=1` timeout 실패에만 적용한다. 5분 안에 정상 한글 답변이 나오면 그대로 통과시킨다.
- timeout 안내는 우선 정적 문구로 둔다. 후보 화면이나 파일을 붙이는 clarifier 연동은 후속 개선으로 분리한다.

## 미해결 / 측정 대상 (실험 전까지 commit 금지)

- 변형2(검색금지 프롬프트)로 agy가 bail을 멈추는가? → A의 운명.
- `-i` interactive가 `-p` print의 async-bail을 해소하는가? → 아키텍처 분기.
- `-c/--continue`에 백그라운드 검색 결과가 살아있는가(빠른 완성) vs 프로세스와 함께 소멸(재bail)? → B의 운명. (onExit가 in-process 검색 subprocess를 죽이므로 결과 persist 여부가 관건.)

## 재현 harness 메모

- 캡처된 bail 프롬프트는 정리되어 없음(agy-bail-retry 세션에서 last_agy_prompt.txt 제거).
- server.js는 함수를 export하지 않음(서버 엔트리). buildContext는 [contextBuilder.js](../../contextBuilder.js)에서 export됨. buildPrompt 조립부는 server.js:1268 내부 → harness에서 재현 필요.
- 재현 가능한 bail 질문 후보. "에이전트 모니터링 엑셀/에이전트서버리스트" (04:00·04:41 동일 테마), "결재정보팝업 결재자명" (08:02 PopApprovalInfo).
