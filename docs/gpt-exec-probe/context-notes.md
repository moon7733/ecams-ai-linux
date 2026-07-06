# Context Notes - GPT exec 권한모드 probe

## 2026-07-01 시작

사용자 결정에 따라 AGY same-repo 동시성 해소는 보류하고 GPT exec 권한모드 검증을 먼저 진행한다. 목적은 Codex CLI의 `read-only`/`workspace-write` 같은 sandbox 모드가 AGY와 달리 원본 workspace 쓰기를 실제로 막는지 확인하는 것이다.

## 2026-07-01 Access denied 해소

기존 `codex --help` 실패 원인은 PATH의 `codex`가 WindowsApps 패키지 내부 alias를 직접 가리키기 때문으로 확인했다.

- 실패 경로. `C:\Program Files\WindowsApps\OpenAI.Codex_26.623.9142.0_x64__2p2nqsd0c76g0\app\resources\codex.exe`
- 실패 증상. `Program 'codex.exe' failed to run: Access is denied`
- 정상 경로. `C:\Users\ecams\AppData\Local\OpenAI\Codex\bin\d8dfab353c0001dc\codex.exe`
- 정상 버전. `codex-cli 0.142.4`

`codex doctor`도 정상 경로에서는 통과했다. doctor는 PATH entries가 WindowsApps alias 2개만 잡혀 있음을 보여줬고, 실제 executable은 로컬 앱 바이너리로 표시했다. 따라서 backend 통합 시에는 PATH의 `codex` 대신 위 정상 바이너리 경로를 명시하거나, 서버 설정에 Codex CLI 경로를 별도 보관하는 방식이 안전하다.

## 2026-07-01 GPT exec 권한모드 5단계 probe

probe는 `scratch/codex-exec-probe` 아래 throwaway 원본과 shadow를 만들어 실행했다.

- throwaway 원본. `C:\ecams-ai\scratch\codex-exec-probe\workspace-real\probe.txt`
- shadow cwd. `C:\ecams-ai\scratch\codex-exec-probe\shadow`
- 실행 바이너리. `C:\Users\ecams\AppData\Local\OpenAI\Codex\bin\d8dfab353c0001dc\codex.exe`

5단계 결과.

- 플래그 확인. `codex exec --help`에서 `--sandbox`와 `read-only`, `workspace-write`, `danger-full-access`가 모두 확인됐다.
- 격리. 실 workspace가 아니라 throwaway real/shadow 디렉터리만 사용했다.
- OFF 대조. `danger-full-access`, cwd=shadow에서 add-dir 밖 절대경로 쓰기를 지시하자 `probe.txt`가 `OFF_1782887773142`로 수정됐다. probe가 쓰기 우회를 탐지할 수 있음을 확인했다.
- ON 검증. `workspace-write`, cwd=shadow에서 같은 절대경로 쓰기를 지시하자 `probe.txt`는 `ORIGINAL` 그대로였고, Codex가 `blocked by policy`로 명확히 거부했다.
- 부작용 확인. `workspace-write`, cwd=shadow에서 `readme.txt` 읽기는 `SHADOW_READ_OK` 출력으로 정상 확인됐다.

결론. GPT exec의 `workspace-write` 권한모드는 AGY와 달리 workspace 밖 절대경로 쓰기를 실제로 차단한다. 이 조건이면 원본 workspace 쓰기 방어를 OS 계정/ACL까지 가지 않고 Codex sandbox로 해결할 가능성이 크다.

주의. OFF 실행은 조기 판정을 위해 파일 마커가 쓰이면 child를 kill했으므로 최종 답변은 받지 않았다. ON과 read 회귀는 정상 종료했고, ON stderr에 sandbox rejection 로그가 남았다.

## 2026-07-01 Claude 회신 4 — probe 결과 합의 + 다음 관문

probe 결과를 Claude가 설계검토 역할로 회신·합의했다(`to-codex.md` "Claude 회신 4", `decisions.md` 반영).

- Access denied 해소 + `workspace-write` 원본쓰기 차단은 합의. AGY `--sandbox`가 못 하던 것을 GPT exec가 해냄 = 모델 전환 계속의 1차 증거. 단 쓰기-안전 축에서만 성립.
- Claude 조정 — **배포 config를 wrapper보다 먼저 확정.** probe는 `workspace-write`+cwd=shadow였는데, RAG는 답을 stdout으로만 뱉고 파일을 안 쓰므로 더 단순한 후보 `read-only`+cwd=실repo가 있다. 참이면 shadow/restore/lock 자체가 불필요. **가설**이라 Codex 3문항 검증 필요(read-only+실repo 전체읽기·전체쓰기차단·쓰기0 성립).
- 남은 진짜 관문은 **품질 + 속도 + 비용.** probe는 안전 기전만 증명. 사용자 원 통증이 지연이므로 속도를 AGY와 명시 대조해야 함. shadow/restore/lock은 채택 확정 전까지 유지.
- 다음 순서. config 가설 검증 → runCodexExecStream wrapper(env 경로) → AGY vs GPT exec 대조 → lock 완화는 보류.

## 2026-07-01 read-scope probe (Claude 직접 실행 — Codex 부재) — 결정적 결과

회신 5의 판별질문(read-only가 읽기를 cwd로 스코프하나)을 Claude가 직접 4개 probe로 검증했다. 실제 고객사 repo는 오염 없이(기존 `.project` 파일 읽기만) 진행.

- **probe 1 (누출 판별).** cwd=`workspace/광주은행/kjbank_html5`, `--sandbox read-only`에서 토스 절대경로 `workspace/토스/toss_html5/.project` 읽기 지시 → **`CROSS=toss_html5` 읽힘.** 자기 repo도 `SELF=kjbank_html5`. **읽기가 cwd로 스코프되지 않음 = 누출 확정.**
- **probe 2 (경계 오판).** C:/Windows/win.ini·`.codex/auth.json` 읽기 → BLOCKED. 처음엔 "git루트 경계"로 오판했으나, 두 파일이 실제로 없거나 경로가 달라 "파일없음"과 "sandbox차단"을 혼동한 결함이었다.
- **probe 3 (격리 dir 검증).** `C:/codex-scope-test`(ecams-ai 밖)에 git init + 광주 파일만 두고 cd → **토스 절대경로 여전히 `CROSS=toss_html5` 읽힘.** 격리 cwd로도 못 막음.
- **probe 4 (결정적, 존재 확실 파일).** `C:/Windows/System32/drivers/etc/hosts`(반드시 존재) 읽기 → **`HOSTS=# Copyright (c) 1993-2009 Microsoft Corp.` 읽힘.** 레포 밖 임의 파일도 읽힌다.

**결론(결정적).** **Windows에서 `codex exec --sandbox read-only`는 쓰기만 막고 읽기는 디스크 전체를 허용한다.** 읽기는 PowerShell `Get-Content` 셸 명령으로 나가며 sandbox가 경로를 제한하지 않는다(Windows는 Landlock/Seatbelt 같은 read-scope 미구현으로 추정). **cwd·git루트·shadow 어떤 파일시스템 트릭으로도 읽기를 스코프할 수 없다.**

**함의.**
- 회신 5의 "`--cd` 좁히기 or add-dir/shadow로 읽기 격리" 갈래는 **무의미**(파일시스템 트릭 무효).
- **하드 읽기 격리는 OS ACL/별도 제한계정(Track 1)이 확실한 길**이나 유일하다고 단정하진 않는다 — 읽기가 PowerShell `Get-Content` 셸 명령으로 나가고 Codex엔 rules/hooks 메커니즘(`--ignore-rules`, hook source 검증)이 있으니, **rules/hooks가 셸 명령을 경로 패턴으로 거부할 수 있는지는 미검증 경량 대안**이다(지금 쫓지 않음, 확인만 열어둠). 단 OS ACL은 codex 프로세스가 디스크 전체를 읽으므로 다른 고객사뿐 아니라 시스템 비밀까지 노출 범위인 점을 해결한다.
- 단 **codex가 AGY보다 읽기 격리가 나빠진 건 아님** — AGY도 `--dangerously-skip-permissions`로 절대경로 읽기가 가능하며, includeDirs는 소프트 작업범위일 뿐 강제 아님. 두 모델 다 하드 읽기격리는 OS ACL 없이는 없다. **읽기-프라이버시는 회신 5에서 Claude가 추가한 별개 멀티테넌트 우려지, 사용자가 pivot한 원 목표(쓰기안전·동시성)가 아니며 AGY 대비 회귀도 아니다.**
- **write-safety는 진짜 개선.** read-only가 모든 쓰기를 막는다(이번 probe 4는 read 테스트라 write 근거 아님 — write 차단은 Codex 선행 probe "repo 쓰기 전부 blocked by policy"와 회신 4 workspace-write probe로 성립). 따라서 restore/lock의 write-충돌 방지 목적은 codex에선 불필요 → **동시성 win은 유효.** 사용자가 pivot한 원 목표는 확인됨.

## 2026-07-01 품질/속도 측정 — 티어 매칭(gpt-5.4-mini) (Claude 직접, 사용자 지시)

사용자 지적 — codex 기본 `gpt-5.5`는 플래그십이라 AGY의 Gemini Flash 3.5와 티어가 안 맞는다. Flash 3.5급 경량 모델로 맞춰야 공정하다. codex 사용가능 모델 = `gpt-5.5`/`gpt-5.4`/`gpt-5.4-mini`/`codex-auto-review`. **mini 티어는 `gpt-5.4-mini` 하나**(5.5-mini 없음)라 이걸로 매칭.

**테스트.** 실제 로그 질문 "운영반영제외 항목과 운영반영체크 항목의 체크를 해제하면 어떤것들이 바뀌어?"(kjbank_html5, developer 성격 소스탐색). 시스템 프롬프트(SYSTEM_PROMPT 4076자) + 질문 조립, `-m gpt-5.4-mini --sandbox read-only --cd workspace/광주은행/kjbank_html5`.

**결과.**
- **품질 = 강함(예상 초과).** eCAMS 답변 포맷(0.분석근거~6.추천질문) 그대로 준수. 함수 호출 체인 정확 추적(`cmdReqClick()`→`chk_SrItem`/`chk_SrCheckOutCancel` requestType→`Cmr0200Servlet`→`Cmr0200.chk_SrItem()`), `cm_sysinfo.substr(19,1)` 비트검증 로직 파악, 실제 DB 테이블(cmr1000/cmr1010/cmr0020/cmm0036 등) 나열, 핵심 결론 정확("DB 구조가 아니라 검증 범위/사전차단 로직이 바뀐다"). 소스 근거 기반, 환각 안 보임. mini 티어치고 매우 좋음.
- **속도 = 나쁨(치명적).** 289s. 1차 시도는 156s 후 `Selected model is at capacity` 에러로 답변 실패. AGY 정상범위 27~127s(timeout 304s outlier) 대비 **2~3배 느리고 timeout 임박.** 사용자 원 통증이 지연인데 mini 티어로도 오히려 악화.
- **신뢰성 = 간헐 용량초과.** 무거운 agentic 탐색 중 `at capacity` 발생(간단 질문은 4s 정상). mini 티어 부하 시 실패 위험.
- **인코딩 = mojibake 위험(정정: 파일은 UTF-8 맞음).** 소스 파일은 UTF-8(BOM 없음, `file -bi` = charset=utf-8, 앞 3바이트 `2f 2a 2a`). EUC-KR 아님 — 사용자 UTF-8 전환은 유효. mojibake는 **PowerShell 5.1 `Get-Content`가 BOM 없는 UTF-8을 시스템 ANSI(CP949)로 오독**해서 생긴 셸 read 아티팩트다. 이 답변은 rg/구조 추론으로 극복해 정상. **고칠 수 있는 파이프라인 디테일**(`Get-Content -Encoding utf8` 강제 또는 rg 사용)이지 파일 문제 아님.

## 2026-07-01 속도/스코프 정정 (사용자 질문 반영)

사용자 가설 — codex가 전체 workspace를 읽어 느린 것 아니냐(AGY는 robocopy로 해당 고객사만 추려 읽음). **측정으로 정정.**

- **내 테스트는 이미 스코프됨.** `--cd workspace/광주은행/kjbank_html5`(단일 고객사 repo)로 돌렸고, 모델이 실제로 읽은 파일은 kjbank_html5 안 4개(ApplyRequest.js/.jsp, Cmr0200.java, Cmr0200Servlet.java)뿐. **다른 고객사·전체 workspace로 안 나감.** → 전체읽기가 289s 원인 아님.
- **단 server.js 배포 wrapper는 `--cd __dirname`(ecams-ai 전체)** 이라 내 테스트보다 넓다(배포 시 별도 문제). 그러나 스코프한 내 테스트도 289s라 스코프 narrowing만으로 속도 안 풀림.
- **289s 진짜 원인 = live agentic 탐색**(순차 rg/Get-Content read + 사이 reasoning). 파일 4개만 읽고도 289s = 데이터량이 아니라 탐색/추론 오버헤드.
- **비교 공정성 정정.** AGY 빠른 수치(27~48s)는 **enduser 가이드-RAG**(사전 계산 컨텍스트 주입, live 탐색 없음) 경로다. codex 테스트는 **developer 성격 agentic** 질문이라 기전이 다르다. AGY **developer** agentic은 원래도 느림 — 사용자 원 불만이 admin(developer) 질문 **304s timeout**이었다. 따라서 codex-mini 289s는 AGY-developer(127~304s)와 **비슷한 급**이지, AGY-enduser-48s보다 무조건 느린 게 아니다. enduser 속도를 맞추려면 codex도 가이드-RAG 사전주입이 필요(live 탐색 아님).

## 2026-07-01 속도 개선 probe (가)reasoning=low / (나)사전주입 (사용자 "둘다")

같은 질문·같은 스코프(kjbank_html5)·gpt-5.4-mini로 두 레버를 측정.

- **(가) reasoning_effort=low = 불명확 + 신뢰성 문제.** 412s. 단 **websocket 재접속 에러 5회**(`os error 10054`, chatgpt.com backend 강제 끊김)로 오염된 수치다. reasoning=low가 속도를 준다는 근거 못 얻음. 애초에 **병목이 reasoning 깊이가 아니라 순차 셸 탐색 왕복**이라 reasoning만 낮춰도 탐색 스텝 수가 그대로면 wall-time 안 준다(가설). **부수 발견 — codex 구독 backend websocket이 불안정**(재접속 반복). 프로덕션 신뢰성 리스크.
- **(나) 컨텍스트 사전주입 + 탐색금지 = 확정 win.** 관련 함수 스니펫(cmdReqClick/realApply/chk_SrItem/chk_SrCheckOutCancel, 6.4KB)만 프롬프트에 주입하고 "제공된 컨텍스트만 근거, 셸/추가읽기 금지" 지시. **85s (live 289s 대비 3.4배 빠름), 셸 read 0회.** 품질은 유지·오히려 향상 — 주입 SQL을 정확 인용(`cmr1000`/`cmr1010` 조인, `cr_status <> '3'`, `cr_qrycd = '11'`, `cr_itemid = cr_baseitem`), `chk_Realstopyn` 정확 메시지, `[04]+운영반영체크[27]` 조합까지. 85s는 AGY 정상범위(27~127s) 안.

**결론(핵심).** **codex 속도를 지배하는 건 모델 티어·reasoning이 아니라 live agentic 탐색이다.** 사전주입(eCAMS가 이미 enduser에 `getGuideKnowledge`로 하는 것, repo-map PoC가 developer에 하려던 것)으로 탐색을 없애면 codex도 AGY 빠른 급(85s)으로 들어오고 품질도 유지된다. → codex 채택의 속도 관문은 "모델을 바꾸자"가 아니라 "**live 탐색 대신 컨텍스트를 미리 넣자**"로 귀결. AGY와 동일한 아키텍처 교훈.
- 남은 caveat. (가)의 websocket 불안정(구독 backend), mini 티어 간헐 용량초과 — 프로덕션 신뢰성은 별도 관문.

## 2026-07-01 developer 질문 3개 대조 — codex vs AGY (사용자 요청)

enduser 말고 developer 페르소나 질문 3개로 대조. 상세 문서 = `docs/gpt-exec-probe/dev-comparison.md`, 답변 원문 = `docs/gpt-exec-probe/answers/`.

- **질문.** Q1 파일단위 배포신청 수정가이드 / Q2 NPE 위험코드 헌팅 / Q3 Cmr0200Servlet requestType 분기매핑. 대상 kjbank_html5, 둘 다 developer live탐색, 같은 SYSTEM_PROMPT. AGY는 라이브 `.shadow` 안 건드리게 `scratch/agy-probe` 격리사본에서 runAgyOnce 동일 플래그(node-pty).
- **AGY(Flash 3.5) = 3개 전부 완주, 검증상 환각 0.** Q1 92.3s(호출체인 라인번호까지), Q2 67.9s(**실제 NPE 버그 발견** — Cmd0101.java:679 `gubun.substring(0,1)` null 미검증, 소스 대조로 실존 확인 + 정확한 diff), Q3 44.5s(switch case **31/33 정확 매핑, 환각 0**, cmr0020_Insert/Delete 2개만 누락).
- **codex(gpt-5.4-mini) = 3개 전부 실패.** Q1 214.4s 후 **websocket 재접속 실패**(os error 10054) 무출력. Q2·Q3 5초 즉시 실패 = **`You've hit your usage limit ... try again at 7:37 PM`**. **핵심 블로커 — 구독 사용량 한도.** 무거운 질문 1개가 토큰 소진→계정 리셋시각까지 잠김. 멀티유저 도구에 치명적(개발자 몇 명이 몇 질문만 해도 전체 고갈). 오늘 앞선 probe들도 소진 기여.
- **단 codex 품질 자체는 문제 아님.** 앞서 같은 repo에서 developer 스타일로 정확히 답한 전례(운영반영제외, 289s, answers/codex_devsample_289s.md).
- **결론.** codex 채택 관문은 품질 아니라 **①사용량 한도(최대 블로커) ②websocket 신뢰성 ③live탐색 속도(사전주입으로 완화가능)**. 속도·정확도만 보면 현재 AGY(무료·안정·44~92s·환각0)가 우위. codex Q1~3는 한도 리셋(7:37 PM) 후 재측정 필요.

## 2026-07-01 codex 재측정 (한도 리셋 후) — 3/3 성공, 품질 대등

한도 리셋 후 codex Q1~3 재측정. 답변 원문 `answers/codex_q{1,2,3}.md`, 대조표 반영 `dev-comparison.md`.

- **3개 다 성공**(한도·websocket 문제 없음). Q1 337.7s, Q2 232.5s, Q3 165.3s — 전 문항 AGY 대비 **~3.5배 느림**(live 탐색).
- **품질 = AGY와 대등, 검증지표선 codex 근소 우세.** 둘 다 환각 0(소스 대조). Q3 requestType **codex 33/33 > AGY 31/33**. Q2 NPE codex 3곳(ConnectionInitialize.java:55 `defaultAutoCommit_s.equals`, LoginManager.java:138 `rs.getString("CM_ADMIN").equals` 등, grep 실존 확인) vs AGY 1곳(Cmd0101:679)+diff. codex=커버리지·정밀, AGY=diff 실용성.
- **신뢰성 재확인.** 2차 성공은 리셋 직후라 통과했을 뿐, 1차의 사용량 한도(무거운 질문 1~2개 소진→계정 잠김)는 유효. 멀티유저 최대 관문.
- **종합 판정.** 품질로는 codex 채택 가능하나, ①사용량 한도 ②속도(3.5배, 사전주입으로 완화가능) ③websocket이 관문. 현재 종합 우위 여전히 AGY. **다음 = codex 사용량 한도 실제 상한·멀티유저 고갈속도 실측**(채택 가부의 핵심).

**판단(사용자 몫).** 티어 매칭(gpt-5.4-mini)에서 **품질은 합격, 속도는 불합격**(289s). write-safety/동시성 win은 유효하나, 지연 해소가 목표였다면 mini 티어 속도가 오히려 걸림돌. gpt-5.5(플래그십)는 더 느릴 개연. 채택하려면 속도/용량/인코딩 3개를 풀어야 함.
