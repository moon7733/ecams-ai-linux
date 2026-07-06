# 되묻기 게이트 재설계 — 컨텍스트 노트

## 결정 (착수 시점)

### CN-1. 버그2 = forceFresh 무시 (한 줄 버그, 수정 완료)
"건너뛰기" → `postChat(ctx, true)` 는 `forceFresh=true` 만 보내고 clarifyTarget 은 안 보냄. 서버 게이트가 `!clarifyTarget` 만 봐서 트리아지 재실행 → 무한 되묻기. 게이트에 `!forceFresh` 추가로 해결. forceFresh 의미 = "사용자 포기, 전체 스킵 후 즉답".

### CN-2. 버그1 = gap 은 잘못된 축
gap(top1-top2) = "어느 화면이냐"(검색 분리도). 사용자 의도 = "이 질문 그대로 답 가능한가"(범위 명확도). 직교한다. gap 임계 튜닝(내 최초 3안)은 전부 잘못된 축을 건드림 → 폐기. 정답 신호 `hasSpecificProblem` 은 이미 계산하나 게이트에서 버리고 2단계에서만 사용 — 이게 버그1 본질. (어드바이저 확인)

### CN-3. hasSpecificProblem 정의가 너무 좁음
"구체적 증상 있나" 기준은 기능질문("파일추출 동작?")을 false 로 떨굼. context-notes(agy-perf-redesign) 의 "기능·증상어 only ~25%" 버킷이 정확히 이 단층. → 기준을 "범위가 좁아 유용히 답 가능한가(answerable)" 로 넓히고 12건으로 검증 후 게이트에 배선. 이 신호가 load-bearing 이므로 배선 전 검증 필수.

### CN-4. 멀티턴은 현재 구조상 불가능 + 버그2 수정과 충돌
clarifyTarget 재전송 시 서버가 트리아지 전체 스킵 → 1라운드로 끝, 추가입력 모호해도 답함. 두 스킵 경로 분리.
- forceFresh = 포기 → 전체 스킵 즉답.
- clarifyTarget = 화면 잠금 + 범위 재판정(여전히 모호하면 또 되묻기).
"몇 번이고 좁혀질 때까지" 의도 충족하려면 clarifyTarget 경로를 blanket-skip 아니라 재판정으로 바꿔야 함.

### CN-5. fast-path 로 레이턴시 보존
코드심볼 직접언급(~33%)은 LLM 없이 confident 유지(~500ms). 나머지만 flash-lite 1회. 어드바이저의 "option3을 게이트가 아니라 fast-path로 재활용".

### CN-6. 게이트는 2신호 AND — 의도 명확 ∧ 대상 수렴 (사용자 지적으로 수정)
"기능질문 → 즉답" 은 틀림. "파일 추출 동작?" 은 의도는 명확해도 여러 화면에 흩어진 기능이면 좁혀야 함. 즉 즉답 = (intentClear) AND (targetConverges). gap 을 sole gate 로 쓴 게 버그1이었지만 retrieval 수렴은 죽지 않음 — **두 번째 필수 축**이다. (CN-2 의 "scope-clarity 가 gap 을 대체" 프레이밍은 사용자가 반증함.)
수렴도를 near-tie 점수 임계값으로 재면 버그1 클러스터링 재발 → **수렴 판정도 기존 flash-lite 1회 호출 안에서** 후보셋 보고 내림(새 호출/임계값 0). 코드심볼 fast-path 는 그 자체가 수렴 신호라 유지.
비대칭. round 1 = 두 신호 / lockedTarget 라운드 = 대상 고정이라 명확도만.

### CN-7. 게이트 설계 전 실측 필수 (armchair 금지)
"기능질문 즉답" 가정이 두 번째로 사용자 도메인지식에 반증됨(데이터 아님). 인덱스(407엔티티) 존재하므로 **D-10 12건 + "파일 추출" 을 queryIndex 통과시켜 top-K 분포 출력 → 손라벨 → LLM split 검증** 을 게이트 확정 전 선행. 검증을 post-hoc 체크박스에서 설계결정 단계로 승격.

### CN-8. Phase 1 실측 결과 — 점수 게이트 사망, LLM-from-labels 확정 (2026-06-29)
`scratch/clarify_retrieval_probe.js` 로 12건 queryIndex top-6 분포 출력 (임베딩만, throttle).
- **gap 은 카테고리를 못 가른다(버그1 실증).** 즉답=0.316/0.005/0.004, 어느화면=0.007/0.000/0.004/0.018, passthrough=0.008/0.109/0.001, 의도좁히기=0.035/0.008. Q1(코드심볼) 빼면 전부 sim~0.65-0.75 에 gap~0.00X 로 뭉침. → GAP_CONFIDENT 게이트 제거 확정.
- **near-tie 임계값도 무용.** near0.05 가 즉답(Q3=6)·어느화면(Q4/5/8=6)·passthrough(Q2/11=6)·의도좁히기(Q12=6) 모두 6. 점수로 수렴 판정 불가 → 어드바이저 경고대로 새 임계값 만들면 버그1 재발.
- **코드심볼 fast-path 는 토큰이 doc 에 살아남을 때만.** Q1(chk_SrCheckOutCancel) hit→gap0.316 깔끔. 단 Q3(uploadysedrsrc)·Q2(Syscom_rsrc1)는 심볼 hit 0 (소스에 없음/토큰화 탈락) → fast-path 적용 < 33%. fast-path 라 OK, 나머지는 LLM 1회.
- **진짜 신호는 후보 "이름/라벨" 의 의미적 결.** 파일추출(Q4/5): download/checkout/source-view/ftp 등 **이질적 기능 분산** → 광범위. 결재자명(Q7): PopApprovalInfo/Cmr6000/PopRequestDetail 등 **결재화면 여러개** → 광범위. 파일추출됬는데(Q6): PopDevRepository(+버전중복)+파일추출 hit 집중 → 수렴. 서버소스(Q11)·리눅스(Q10): 인프라/노이즈 → 범위밖.
- **보조 신호 후보.** hits(키워드) 존재 여부 — Q6 은 top3 전부 [파일추출] hit 집중 vs Q4 는 hit 0(순수 임베딩 분산). 라벨과 함께 LLM 에 넘기면 수렴 판정 정확도 ↑ 가능(임계값 아님).
- **결론.** 게이트 = LLM 이 (질문 + 후보 라벨[+hit])로 intentClear/targetConverges/outOfScope 판정. 점수는 후보 선별·fast-path 에만. → Phase 2 = 이 LLM split 이 실제로 맞는지 검증(throttle, 대표 케이스부터).

### CN-9. Phase 2 실측 — LLM 게이트 5/6 (action 기준) (2026-06-29)
`scratch/clarify_llm_probe.js` 6건 flash-lite 3-boolean. **action(즉답/되묻기/passthrough) 채점:**
- ✓ Q2 파일추출(converge=F→어느화면), Q4 결재자명(converge=F→어느화면), Q5 결재오류봐줘(intentClear=F→의도좁히기), Q6 리눅스(oos=T→passthrough). 이질/모호/범위밖 3종 분기 정확.
- ✗ Q1 chk(LLM converge=F, want 즉답) → **fast-path 가 잡으므로 무관**. fast-path 필수 재확인.
- ✗ Q3 파일추출됬는데(intentClear=F→되묻기, want 즉답) → dedup 이 버전중복(집중신호) 제거 + LLM 이 intentClear/converge 혼동. 멀티턴에서 1턴 더 물으면 해결(안전방향, 허용).
- **결정.** 검증된 게이트(LLM 3-boolean + 코드심볼 fast-path) 설계 확정. 점수는 후보선별·fast-path 에만, 임계값 게이트 없음.

### CN-10. 라벨 품질은 게이트를 막지 않음 — 스코프 크립 차단 (2026-06-29)
실측 중 라벨 추출 깨짐 발견(`CheckOutCnl`/`FileDownloadModalNew` label="작성자: 이용문", 원천 = ScreenMap.md 102·105행, 위키 생성기가 .js History 작성자줄을 화면명으로 오집). 그러나 **Phase 2 정답 4건은 그 쓰레기 라벨이 입력에 있는데도 맞음** → 라벨은 게이트 전제조건 아님(어드바이저 확인).
- **(A) .js 주석 첫 줄 추출 = 기각.** 스캔(`node -e`): JS 213개 중 라벨깨짐 92, .js 복구 가능 22뿐 + 복붙 오염 심각(ApplyReq→"체크아웃 화면 기능", CheckOut/GitCheckOut 동일, demo-config 영어잡설). **새 오답 라벨 주입**이라 코드명보다 나쁨.
- **할 것(딱 하나).** `loadAliases` 방어적 거부 — 화면명이 `/작성자|작성일|버전\s*:/` 매치면 별칭 추가 안 함 → 코드명 폴백. ~5줄, 되묻기 버튼 "작성자:..." 노출만 차단. 92개 복구 프로젝트 안 함.
- **추후(옵션).** LLM 게이트 입력 강화하려면 comment 헤더 아님 — 엔티티 doc 의 `_ktoks`(JSP UI 라벨 한국어 토큰, D-10 "JSP 소스=최다")가 더 신뢰. 게이트 이미 통과하므로 지금 안 함.

### CN-11. 실사용 1건(빌드 처리유형 자릿수) — 게이트 동작 검증 + 노이즈 가지치기 (2026-06-29)
질문 "빌드처리유형탭 처리유형 두자리→세자리, 어디 수정?" → 게이트 intentClear=true, converge=false → "어느 화면?" 되묻기. 사용자 확인 결과 **이게 맞는 동작** — Cmd1200(Java 백엔드 처리유형) + TypeRegistrationTab(UI 탭) 둘 다 진짜 고쳐야 하는 화면이라 (✓의도, ✗수렴) 행이 정상 발화. 멀티턴 1클릭으로 좁힘.
- **이번 라운드 코드 변경(유지).**
  1. judgeGate 가 `targetId` 반환 → triage 가 score-top1 아니라 LLM 지목 후보를 타깃으로. score-top1 노이즈(부스트로 Cmd1200이 top1, 정답 TypeRegistrationTab은 순수 sim 1등인데 #5) 회피. Q2/Q4 회귀 없음.
  2. targetConverges 정의 reframe — "후보 동질성" → "질문이 후보 중 하나를 명확 지목(무관 노이즈 무시)". 단 이 케이스는 Cmd1200/TypeRegistrationTab 둘 다 진짜 관련이라 여전히 converge=false(정상).
  3. **노이즈 가지치기** — judgeGate options 에 관련 후보만, triage 가 friendlyLabel 받은 후보만 버튼 노출. 결과 [처리유형 관리, 빌드/릴리즈 유형등록] 2개로 정리(개발툴연계·비밀번호변경×2 제거). 콜 0 추가.
- **[BLOCKER 아님·follow-up] retrieval 약한부스트 노이즈.** `queryIndex` 약매칭 +0.15 가 숫자·조사형 토큰("3자리","자리로")까지 부스트 → 비밀번호변경/개발툴이 top-6 진입(비번 문서 "N자리로"와 우연 일치). 순수 sim 으론 정답 TypeRegistrationTab 0.754 가 1등, 노이즈는 하위(0.645). 부스트가 노이즈를 끌어올림. 단 같은 부스트가 파일추출→PopDevRepository 를 살림 → 제거시 회귀 위험, 자체 검증셋 필요. **별도 retrieval 워크스트림으로 분리, 이번에 안 건드림(가지치기로 UX 영향 차단됨).**

### CN-12. 추천질문 되묻기 스킵 + 이어서 질문하기 (2026-06-29, 사용자 요청)
- **추천질문 클릭 → 되묻기 스킵.** AI 추천질문은 이미 구체적이라 다시 안 물음. `skipClarify` 플래그(forceFresh 아님 → 캐시 유지). 맥락은 history 로 buildContext 에 전달.
- **이어서 질문하기 버튼.** 답변 하단(stream/cached 양쪽 bottomDiv)에 추가. 누르면 입력창 포커스 + 안내 placeholder + 다음 전송 되묻기 스킵. history 는 원래 항상 실려서 이전 Q/A 이어감.
- 배선. index.html `_skipClarifyOnce`(1회성) → sendMessage 가 ctx.skipClarify 로 소비 → postChat body skipClarify → server triage 게이트 `!skipClarify`. startFollowUp/endFollowUpMode 로 placeholder 복원.
- 재기동 필요. server.js 변경 → 서버 재시작, index.html 은 정적이라 브라우저 새로고침.

### CN-13. B안 — 범용 의도게이트 (인덱스 없는 repo, 서버·플러그인 포함) (2026-06-29)
증상. 고객사 하나은행중국법인 "결재정보에서 오류나 확인해줘" → 되묻기 없이 바로 분석. 원인 = hnbank_cn 엔티티 인덱스 없음(kjbank만 빌드) → triage no_index → 통과. 추가로 기존 triage 는 **web repo 에서만** 작동(server/plugin 은 아예 게이트 안 탐).
- **B 구현(인덱스 빌드/임베딩 0).** clarifier `judgeIntentOnly` 추가 — 후보 없이 질문만으로 outOfScope/intentClear 판정(flash-lite 1콜). triage 의 no_index 분기에서 호출 → 막연=clarify(후보없음), 구체=no_index(진행), 인프라=passthrough. 인덱스 없으면 queryIndex 가 embedText 전에 [] 반환 → 임베딩콜 0, flash-lite 1콜만.
- **web 전용 제한 해제.** server.js triageRepo = web repo 우선, 없으면 allowedRepos[0] → 서버·플러그인도 게이트 진입. repo 타입 아닌 **인덱스 유무**로 full(화면버튼) vs intent-only(텍스트되묻기) 갈림.
- **검증(hnbank_cn, scratch/clarify_b_probe.js).** 막연→clarify / 구체→no_index / 인프라→passthrough 3/3.
- 프론트 무변경. intent-only clarify 는 candidates=[]·lockedTarget=null → renderClarify 가 텍스트+건너뛰기만 렌더, 사용자가 직접 구체화 타이핑.
- 비용. 인덱스 없는 repo 는 질문당 flash-lite 1콜(임베딩/쿼터 무관). 화면버튼 품질 원하면 그 repo 인덱스 빌드(A) 또는 로컬임베딩(D) — 별도.

### CN-14. 플러그인 질문 되묻기 없음 + 신한EZ 파일 — 필터 버그 + sample_db 권한 불일치 (2026-06-29)
증상. 광주은행 플러그인 "체크인 수정" 질문이 (a) 되묻기 없이 바로 분석, (b) 신한EZ 파일을 읽음. 로그에 [Triage] 없음 + includeDirs=sample_db.
- **근본원인.** 프로젝트 필터 팝업 `applyProjectFilter` — 플러그인 타입만 체크하고 개별 플러그인 미선택 시 `_selectedPlugins` 비어 **모든 플러그인 제외**(return false) → DB기본포함이라 **repos=[sample_db]만 전송**. admin 권한엔 sample_db 없음(companyId none) → allowedRepos=[] → triage 게이트 `allowedRepos.length>0` false로 **스킵**(=[Triage] 부재, stale 코드 아님). 답변경로는 effectiveRepos(1746/1890)가 sample_db 자동포함 → agy 가 .shadow\workspace 전체 떠돌다 신한EZ CheckInWizard 주움.
- **fix1 (index.html, 브라우저 새로고침).** applyProjectFilter — 플러그인 타입 체크 시 개별 미선택이면 **그 타입 전체 포함**(`_selectedPlugins.size===0 || has`). → 진짜 플러그인 repo 전송 → 되묻기·정확 분석 복구.
- **fix2 (server.js, pm2 재시작).** 사용자 도메인 규칙 — sample_db 는 실제 DB 없는 고객사 공용 폴백이라 권한 무관 항상 허용. allowedRepos 필터에 `r==='sample_db' ||` 추가. agy effectiveRepos 자동포함과 권한레이어 일관성. (전역으로 원하면 permissions.getRepoLevel 에 넣어야 — UI 목록에도 노출됨.)
- 플러그인 케이스는 fix1만으로 해결(allowedRepos 에 플러그인 있음). fix2 는 sample_db-only degenerate 케이스·규칙 일관성용.

### CN-15. 새 대화에서 범위필터가 안 뜸 — selectedRepos 가 단일타입으로 굳음 (2026-06-29)
증상. 광주은행 플러그인 질문(이전 대화) 후 **새 대화**로 서버 질문 "tar파일전송 오류 확인해줘" → 범위선택 팝업 안 뜨고 `[Triage] repo=Eclipse_Plugin mode=clarify`. 사용자는 "서버/플러그인/웹 중 고르는 화면이 안 떴다" 고 인지.
- **근본원인(추측 아님, repo 개수로 증명).** 광주은행 코드 repo 6개(web1+server1+plugin4)인데 보낸 건 5개 → 이미 좁혀진 선택. 단일타입 5개 조합 = plugin4+sample_db 뿐. 좁힘은 `applyProjectFilter` 가 `selectedRepos = new Set(filteredRepos)` 로 **덮어쓰는 것**(index.html:4602)으로만 생기고, `newChat()` 은 selectedRepos 를 안 되돌림 → 플러그인-only 가 새 대화로 이월. codeTypes={plugin}=1 → `codeTypes.length>=2` false → 팝업 미발동 → triage 가 `allowedRepos[0]=Eclipse_Plugin` 집음.
- **되묻기 발생 자체는 정상.** 서버·플러그인 둘 다 인덱스 없어 judgeIntentOnly(repo-agnostic) → "오류 확인해줘"=막연 판정. **팝업 고쳐도 이 질문은 동일하게 되묻는다.** 팝업 수정의 실익은 triage 가 아니라 **답변 스테이지** — 구체화 후 buildContext/agy 가 plugin-only 가 아니라 올바른 kjbank_server 를 뒤짐(plugin-only 면 CN-14 신한EZ 류 오답 위험). "플러그인 선택됨"은 답변범위 버그지 되묻기 발생 아님.
- **fix (index.html, 브라우저 새로고침).** `resetReposToCurrentCompany()` 추가 — 현재 selectedRepos 의 회사(none 아닌 첫 repo 기준) 캡처 → 그 회사 repo 전체 재선택 → renderRepos. `newChat()` 에서 호출. 전역 기본(첫 회사)이 아니라 **현재 회사** 기준이라 다른 회사 작업 중이던 사용자 회귀 없음(어드바이저 지적). 타입 다양성 복구 → 새 대화 첫 질문에서 범위 팝업 재발동.
- **triageRepo content-blind(server.js:2584)는 분리 유지.** 단일타입으로 좁히고 나면 web 혼입 없어 거의 안 물림. 이번에 안 묶음.

### CN-16. intent-only 무한 되묻기 — history 멀티턴 + backstop cap (2026-06-29)
증상. 도마 플러그인(인덱스 없음) "동기화 안됨" 질문 → 5턴 연속 되묻기. 사용자가 "도마플러그인/test.java/우클릭동기화/운영배포 내려오길 기대" 까지 구체적으로 답해도 게이트가 매번 intentClear=false → 무한 루프.
- **근본원인(실측 확정).** 멀티턴 좁히기는 **후보잠금(locked) 경로에만** 있다(설계 C). intent-only 경로(judgeIntentOnly, candidates=[]·lockedTarget=null)는 잠글 타깃이 없어 사용자 답변이 매번 **고립 판정**(history 미사용). `scratch/clarify_multiturn_probe.js` 측정 — 각 답변 단독은 A2/A3/A4 전부 false(이전 맥락 빠져 막연하게 읽힘), 그러나 **누적하면 2턴째에 intentClear=true 로 뒤집힘**. 즉 화면-고착(어드바이저 가설 (b))이 아니라 history 누락이 원인.
- **cap=1 우회는 폐기(이전 커밋 되돌림).** 사용자 지적 — "딱 한 번" 은 plan 목표2(구체적 될 때까지 멀티턴)와 충돌. 게다가 isolation-judging 을 가린 것이지 고친 게 아님.
- **기각한 안 — judge 셋 일괄 history 주입.** judgeGate/judgeLocked 까지 건드리면 CN-9/CN-11 검증결과 회귀. → **judgeIntentOnly 한 함수에만** history.
- **채택 — history 멀티턴 + backstop cap (clarifier.js+server.js: pm2 재시작 / index.html cap=1 흔적 제거: 새로고침).**
  - `judgeIntentOnly(question, apiKey, history)` — 사용자 턴만 추려 `[처음질문]/[추가설명N]/[현재추가설명]` 누적 블록으로 종합 판정. 정확성·목표2 담당.
  - `triage(repoId, question, apiKey, lockedTarget, history, topK)` — history 전달. intentClear 풀릴 때까지 되묻되, `priorUserTurns>=3` 이면 backstop 으로 강제 진행(no_index) → 종료 보장.
  - server.js triage 호출에 `history` 전달. 맥락 범위 = **사용자 답변만** (긴 분석답변은 노이즈, AI 되묻기질문은 애초 messages 미저장 — 사용자 결정).
  - 분석 윈도우 `slice(-2)→slice(-4)` — 멀티턴 backstop(최대 4턴)에서 처음 질문(핵심 증상)이 안 잘리게.
- **검증(clarify_multiturn_probe.js).** 실제 transcript: 턴1 되묻기→턴2 자동진행✓→이후 진행. 끝까지 막연: 턴1~3 되묻기→턴4 backstop 진행✓. 멀티턴 좁히기 + 종료보장 둘 다 충족.
- **locked 경로는 유지.** 후보 선택 멀티턴은 정상(설계 C). history 는 intent-only 한 곳만.

## 미정 / 추후
- (follow-up) retrieval 약한부스트 토큰 필터 — 숫자/짧은/조사형 토큰 제외, 검증셋 만들어 회귀 확인 후. CN-11.
- gap 보조경로(구체적+화면동점 → 화면버튼 곁들이기) — 이번 비목표.
- 멀티턴 라운드 상한 — intent-only 경로는 history 누적 + backstop cap=3 적용(CN-16). locked(후보잠금) 경로는 아직 상한 없음 — 필요 시 N회 후 강제 진행 검토.
- 잠긴 화면의 컨텍스트를 재판정 프롬프트에 넣을지(화면 안에서의 구체성 판정 정확도 ↑) — 구현 시 결정.
