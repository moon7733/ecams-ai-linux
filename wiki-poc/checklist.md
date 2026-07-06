# Wiki v2 PoC 체크리스트

## Phase 0 — 합의 (현재)
- [x] 진단: 현재 wiki/는 mechanical extract, LLM wiki 아님 — 확인
- [x] 방향: 현재 wiki/ → index/ 리네임 + LLM 레이어 신설 — 합의
- [x] PoC repo: `moon7733_kjbank_html5` — 결정
- [x] PoC 첫 페이지: `cr_status` 상태머신 — 결정
- [x] plan.md / checklist.md / context-notes.md 작성

## Phase 1 — 열린 결정 확정
- [x] 모델 전략: 2단계 비교 (Opus 4.7 베이스라인 → Haiku/Flash/DeepSeek diff)
- [x] 컨텍스트 추출: B+A 하이브리드 (cr_status grep + Main/ScreenMap/Index.md 항상 포함)
- [x] 산출물 위치: wiki-poc/out/ (PoC), 검증 후 wiki→index 리네임 + 새 wiki/ 신설

## Phase 2 — 컨텍스트 준비 (3 repo 통합)
- [x] kjbank_html5 의 `cr_status` grep — 205개 파일 / 800회 등장 확인
- [ ] kjbank_server 존재 확인 + CMR1000 / cr_status / cr_acptno grep
- [ ] sample_db 존재 확인 + CMR1000 / CMR9900_STR / 트리거 grep
- [ ] CMR1000을 다루는 **핵심 클래스/서블릿/프로시저 목록** 식별 (사용자 힌트 + grep)
  - html5: Cmr0100(체크아웃), Cmr0200(체크인/배포), Cmr3100(결재), Cmr3200(현황) 등
  - server: ecams_mgr, ecams_Acct
  - db: CMR9900_STR, CMR1000 트리거
- [ ] 빈도 상위 페이지 = 풀 컨텍스트, 나머지 = grep -C 5 snippet
- [ ] 항상 포함: 각 repo의 Main.md, ScreenMap.md, Pages/*/Index.md
- [ ] 통합 입력 파일 (`wiki-poc/context/CMR1000_cr_status_context.md`) 생성
- [ ] 글자수/토큰 추정 → Opus 4.7 한도(200K) 내 확인

## Phase 3 — 합성
- [x] 프롬프트는 sub-agent 호출 시 직접 인라인으로 전달 (별도 파일 X)
- [x] **베이스라인 합성**: Opus 4.7 sub-agent → `wiki-poc/out/moon7733_kjbank/Concepts/CMR1000_cr_status_상태머신.opus47.md`
  - 토큰 사용: 122K, 시간: 약 7분 (420s)
  - 결과: 4개 상태값 확정 (0/3/8/9), 6개 명시적 전이 + 단조성 negative finding, 9개 출처 인용
- [ ] **다운사이즈 합성** (사용자 검증 후 진행 여부 결정):
  - Haiku 4.5 → `....haiku45.md` (Anthropic API key 필요)
  - Gemini Flash → `....gemini-flash.md` (Gemini SDK 있음)
  - DeepSeek V3 → `....deepseek-v3.md` (DeepSeek key .env에 있음)

## Phase 4 — 검증
- [x] **베이스라인(Opus) 1차 검증** (사용자 도메인 전문가 확인):
  - 상태값 4개 정확 ✓
  - 단조성 정확 ✓
  - writer 단일성 정확 ✓ (사용자도 새 발견)
  - 보강 필요: `8` 의미 정교화, 호출 경로 (PopRequestDetail.js / Cmr3300 등) 추가
  - 결론: **환각 0, PoC 가치 입증**
- [ ] (선택) 다운사이즈 비교 — Anthropic API key 발급 후 Haiku, DeepSeek key로 DeepSeek V3, Gemini SDK로 Flash 시험
- [ ] (선택) 1차 페이지 보강 — 사용자 피드백 반영해 sub-agent에 SendMessage로 정교화 요청

## Phase 5 — 회고 및 결정
- [ ] context-notes.md에 결과 요약 + 비용 + 다음 단계 제안
- [ ] 사용자 검토
- [ ] Go/No-go 결정: 확장할지(다른 개념 페이지) / 폐기할지 / 접근 수정할지

## Phase 6 — system.md + 다운사이즈 시험 (2026-05-18 추가)
- [x] `wiki-poc/system.md` 작성 — 10개 규칙 + PoC 사례 inline
- [x] `wiki-poc/scripts/synthesize_deepseek.js` 작성 — OpenRouter 경유 DeepSeek V3.1 호출
- [x] `wiki-poc/scripts/build_context_compressed.js` 작성 — 128K 한도 압축 빌더 (키워드 ±30 라인)
- [x] 1차 다운사이즈: CMR1000.cr_status (DeepSeek V3.1 + system.md, 압축 input 157K tokens, 103s)
- [x] 2차 다운사이즈: eCAMS 배포 분기 (DeepSeek V3.1 + system.md, 압축 input 94K tokens, 159s)
- [x] diff 분석 (context-notes 결정 23~25): 형식 80~85%, 사실 50~55%, 출처 환각 다수, 깊이 30%, 4배 빠름
- [x] 메모리 갱신: [[project_wiki_v2_initiative]] 진행 상황 한 줄 추가
- [x] Haiku 4.5 다운사이즈 1차 (CMR1000.cr_status, 48s, 10K chars) — 결정 27
- [x] Haiku 4.5 다운사이즈 2차 (eCAMS 배포 분기, 38s, 8K chars) — 결정 27
- [x] 종합 점수표 갱신 — 결정 28 (Haiku가 진짜 후보, 2-stage 결론 철회)
- [x] Gemini 2.5 Flash 다운사이즈 1·2차 — 1차 환각 폭주, 2차 정상 (결정 29)
- [x] GPT-5 mini 다운사이즈 1·2차 — 표기 정직성 최고, 함수명 인용으로 환각 회피 (결정 29)
- [x] 5모델 종합 점수표 — GPT-5 mini 1위, Haiku 2위 (결정 30)

## Phase 7 — 입력 enrichment 시험 (2026-05-19)
- [x] CMM0020 INSERT 데이터 발견 (자료에 이미 있었음, input에 안 넣었을 뿐)
- [x] `scripts/build_enriched_context.js` 작성 — full / minimal variant 옵션
- [x] enrichment 추출 (full: 140행 11개 CM_MACODE / minimal: 65행 4개)
- [x] Haiku 4.5 + GPT-5 mini × 1·2차 = 4개 enriched 합성
- [x] 어제 결과와 diff 분석 — CMR0020 오염 환각 사라짐, CMR9900 거꾸로 환각 정정 (결정 31~33)
- [x] context-notes 결정 31~33 누적, 진입 가이드 다음 후보 갱신
- [x] Opus 4.7 enriched 합성 (직접) 2개 — CMM0020.CLOSEDT 가 dead code 운영 증거임을 발견 (결정 34)
- [x] 사용자 피드백 메모리 저장: 같은 모델은 OpenRouter 우회하고 직접 합성 (`feedback_self_synthesis.md`)

## Phase 8 — (d) 무압축 input + enriched 검증
- [x] `scripts/build_enriched_raw_context.js` 작성 — 무압축 .md + full enrichment
- [x] 4모델 병렬 합성 (Haiku 1·2차 + GPT 1·2차)
  - Haiku 1·2차: ❌ 200K 한도 초과 fail (예상대로 — Anthropic 한계)
  - GPT 1·2차: ✓ 169K/216K input, 149s/147s, 8.9K/10.2K chars
- [x] diff 분석: 무압축은 환각 안 줄임 — 라인 인용 변화 0, dispatcher inconsistency 추상화 후퇴, 시간 2.4배 증가 (결정 36~37)
- [x] 결론: **압축 input + full enrichment + GPT/Haiku** 가 운영 최적 조합

## Phase 9 — (i) 자동 entity 발굴 + 자동 input 빌드 (사용자 지적 약점 해결)
- [x] `scripts/discover_entities.js` 작성 — entity 자동 발굴, cross-layer score ranking
- [x] 발굴 결과 검증: PoC 사용자 수동 선정 entity 모두 top ranking 자동 발견 (CMR1000 r3, CR_STATUS combo r32, CMR9900 r8, CR_QRYCD r22)
- [x] `scripts/auto_build_context.js` 작성 — entity 받아 grep + ranking + 압축 + enrichment 자동 매핑
- [x] CMR1010 entity 로 end-to-end 자동 합성 시험 — GPT-5 mini, 100초, 8.8K chars 페이지 출력
- [x] 자동 합성 페이지 품질 검증: CMR1010 라벨 정확, 트리거 cascade 흐름, Writer/Reader 분석, PGMSTACHK (자료 없음) 정직 표기 (결정 39)
- [x] 운영 도입 가능성 확인 — 한 사이트 반나절 (사용자 추정과 일치, 결정 41)

## Phase 10 — (i-improve) 자동 도구 v2 개선
- [x] `discover_entities.js` v2 — Server raw + DB raw 추가 스캔, 도메인 가중치 (combo×1.8, 동명 컬럼 패널티)
- [x] `auto_build_context.js` v2 — entity 키워드 → CMM0020 자동 매핑 (CMR* 인접 테이블 자동 포함, REQUEST/SYSGBN 자동)
- [x] CMR1010 v2 재합성 검증 — 150K tokens (-7%), 87s (-13%), 새 사실 발견 (ON DELETE CASCADE, CMR9910 알림, 트리거 영향권역)
- [x] discover ranking 정확도 개선: CMR1000.CR_STATUS combo r32 → r7, Server raw 효과 75배 증가
- [x] enrichment 자동 매핑: 33KB → 6.2KB (5.3배 절약)

## Phase 11 — (j) Linter 작성 + 양산 안전망 검증
- [x] `scripts/lint_page.js` 작성 — 10개 검사 항목 (헤더, 표기 비율, 콜론, 잔존 불확실 섹션, 출처 인용, orphan link 등)
- [x] 10페이지 일괄 검사 → 모델별 system.md 준수도 정량 측정
- [x] 핵심 발견: GPT 표기 챔피언 (80%+), Haiku (사실) 표기 거의 안 함 (0%), Gemini Flash 1차 폭주는 error, DeepSeek 거짓 단정 7건 검출
- [x] 운영 게이트 정책 제안 (결정 45): error≥1 거부, warn≥5 사람 검토, 표기 비율<30% 재검증
- [x] PoC 자동화 도구 세트 완성 — discover + auto_build + synthesize + lint (결정 46)

## Phase 11.1 — (k) Batch 자동 양산 (사람 개입 0)
- [x] Entity 자동 선정 — top ranking 에서 PoC 미작성 5개 (CMR0020 / CMR9900 / CMR1000.CR_QRYCD / CMR9900_STR / CMM0020)
- [x] auto_build_context.js × 5 sequential
- [x] synthesize × 5 GPT-5 mini 병렬 — 모두 60~90초
- [x] lint_page.js 일괄 검증 — error 0, warn 6, info 7 (모두 운영 안전망 통과)
- [x] 새 발견: CMR0020 25+ 값 매핑, CMR9900 단독 페이지, CMR1000.CR_QRYCD REQUEST 매핑 활용, CMR9900_STR 입출력 로직, CMM0020 메타 페이지
- [x] 운영 도입 가능성 정량 입증 — 5 페이지 = 약 90초 (병렬), 한 사이트 50 페이지 = 약 15분 (결정 47~48)

## Phase 12 — 5 batch 도메인 sampling 검증 (운영 도입 직전 정확도 측정)
- [x] CMM0020 코드사전 — 사용자 검증 완료 (결정 49). 정확 7/10, 환각 1건 (read-only), 자료없음 표기 거짓 1건 (CodeInfo 화면 입력 누락)
- [x] CMR0020 자원원장 — 사용자 검증 완료 (결정 50). 정확 11/12 (92%), 환각 1건 (CR_SAVESTA 복원 부재 — CMR1010_TRG 입력 누락), 불완전 1건 (22개 중 10개 매핑만)
- [x] CMR9900 결재 큐 — 사용자 검증 완료 (결정 51). 정확 8/12 (67%), **환각 1건 (CR_STATUS 도메인 원칙 위반)** + 부분 정확 2건 (comment vs 실제 동적 분기)
- [x] CMR9900_STR 프로시저 — 사용자 + **opus 직접 검증** 완료 (결정 52). 정확 9/12 (75%), 환각 1.5건 (Sv_SgnCd 의미 + CR_Status '8' 다른 컬럼 값 혼동), **같은 entity 두 페이지 환각 불일치 발견**
- [x] CMR1000.CR_QRYCD — 사용자 검증 완료 (결정 53). 정확 10/12 (**83%, 최고**), 환각 0건, 부분 정확 1건 (28→10 매핑) + 잘못된 자기 의심 1건 (Oracle CHAR 부등호 비교)
- [x] 5 batch 종합 정확도 계산 (결정 54): **평균 77.4%, 환각률 9%, 운영 도입 즉시 가능 (system.md 강화 후)**
- [x] 운영 도입 개선 후보 정리 (결정 54): **즉시 적용 (p)(s)(t)(x) + 개발 (o)(v) + 사람 검증 정책**

## Phase 13 — system.md 강화 + 5 페이지 v2 재합성 (2026-05-19)
- [x] system.md §3 강화 (다른 테이블 enrichment 금지) + §11 (전 값 인용) + §12 (출처 메타 라벨) + §13 (도메인 환경) 신설
- [x] 5 페이지 v2 GPT-5 mini 병렬 재합성 (58~82초)
- [x] Linter 일괄 검증 — error 0, (사실) 비율 하락 (정직성 우선 효과)
- [x] v1 vs v2 환각 패턴 해결 검증 (결정 55): **5개 환각 패턴 중 4개 해결**, 미해결 2개는 system.md 외 영역 (auto_build_context.js + 정적 분석)
- [x] 예상 환각률: 9% → 2~4% (4개 패턴 해결 효과)

## Phase 14 — (n) RAG 연결 PoC (옵션 C, 2026-05-19)
- [x] PoC 스크립트 작성 — `scripts/rag_poc_compare.js` (7 질문 × 2 답변)
- [x] baseline (wiki/) vs treatment (baseline + wiki v2 5 페이지) 답변 비교
- [x] 14번 GPT-5 mini 호출 (질문당 ~10초)
- [x] 정답 (5 batch 검증) 대비 정량 평가 (결정 56)
- [x] **결과: 정답률 14% → 86% (6배), 환각률 29% → 0% (완전 제거), 추가 비용 $0.005/질문**
- [x] wiki v2의 RAG 가치 정량 증명 완료
- [x] 미해결 1건 (Q2 CodeInfo) — auto_build_context.js (o) 강화 필요

## Phase 15 — (o) auto_build_context.js v3 — input 누락 환각 해결 (2026-05-19)
- [x] `scripts/auto_build_context_v3.js` 작성 — (a) administrator 폴더 강제 포함 (CMM_ADMIN_MAP), (b1) same-prefix 트리거, (b2) cross-table 트리거, forced 우선순위 sort, grep-promotion
- [x] CMM0020 v3 빌드 — forced 4개 (CodeInfo.js/jsp/java/Servlet 모두 강제 포함 ✓)
- [x] CMR0020 v3 빌드 — forced 5개 (CMR0020_TRG, CMR0020_UPDT_TRG, CMR1010_TRG, CMR1000_TRG, CMR9900_TRG 모두 우선순위 격상 ✓)
- [x] CMM0020 v3 / CMR0020 v3 GPT-5 mini 재합성 (병렬, 82~84초)
- [x] Linter 검증 — error 0, CMR0020 (사실) 63%, CMM0020 (사실) 14% (정직성 우선)
- [x] **CMM0020 v3 → Q2 (CodeInfo) 해결 직접 증명**: line 4·21 "관리자 UI ... setCodeValue() → /webPage/ecmm/Cmm0100Servlet"
- [x] **CMR0020 v3 → CR_SAVESTA 환각 (결정 50) 완전 해결**: line 50-53 CMR1010_TRG 라인별 인용
- [x] RAG PoC 재실행 — Q2 정량 해결 (baseline "자료 없음" → v3 "관리자 UI CodeInfo")
- [x] **5 batch 환각 패턴 6개 중 5개 해결, 1개 (동적 분기) 사람 검증 영역** (결정 57)

## Phase 16 — 비즈니스 로직 cross-cutting PoC + ApprovalModal v3 (2026-05-19)
- [x] 사용자 질문: "운영배포 결재정보 팝업에서 결재자 변경 가능 조건"
- [x] PoC 1차 — wiki v2/v3 5 페이지: A 부분 정답 (대결자만), B 빈 답변 (결재 영역 부재)
- [x] mechanical extract 본질적 한계 발견 — 함수 시그니처 추출 가능, 비즈니스 분기 로직 불가
- [x] auto_build_context_v3.js (c) UI raw 강제 포함 규칙 추가 — entity 이름과 같은 raw .js/.jsp 자동 포함
- [x] ApprovalModal v3 합성 (62초, 10K chars) — cm_gubun "3"/"6" 분기 정확 추출 + 코드 버그 3건 자동 발견
- [x] **PoC 2차 — B (v2/v3 6 페이지) 완전 정답**: cm_gubun "3" (팀내책임자) + "6" (업무책임자) + delyn "N" + cm_position 권한 매칭 + 더블클릭 트리거
- [x] **결정 58: wiki v2 합성의 본질적 RAG 가치 결정적 증명** — mechanical extract로 답변 불가능한 cross-cutting 비즈니스 로직을 v2 합성으로 해결

## Phase 17 — 비즈니스 로직 PoC 2 — 신청 → DB INSERT cross-cutting (2026-05-19)
- [x] 사용자 질문: "운영배포 신청버튼 누르면 DB 어디에 값 들어가?"
- [x] PoC 실행 — A baseline vs B (v2/v3 6 페이지)
- [x] B 우위: CR_QRYCD='04' 정확 인용, 트리거 cascade → CMR0020 갱신 정답 (baseline은 "자료 없음")
- [x] **둘 다 누락**: CMR9900 INSERT (결재 큐 생성), CMR9910 알림 트리거 cascade
- [x] 원인 분석 — 신청 진입점 cross-cutting 페이지 (request_Deploy / ApplyRequest) 부재
- [x] **결정 59: 운영 도입 시 신청 진입점 페이지 + 트리거 페이지 추가 합성 필요**

## Phase 18 — discover v3 + top 50 batch 양산 + wikiV2Loader 동적 선택 (2026-05-19)
- [x] discover_entities_v3.js — UI raw + bizMethod + ui_screen 패턴 추가, per-kind quota 보장
- [x] 227 entity 발굴, top 50 batch 자동 양산 (50/50, 11분, $0.10)
- [x] wikiV2Loader 동적 선택 — core 7 + 메시지 매칭 top 5 (한국어 키워드 + 복합 키워드)
- [x] contextBuilder message 전달 + isReasoningModel 분기 (max_tokens 16K + reasoning_effort minimal)
- [x] GPT-5 mini 모델 추가 (server.js + index.html 드롭다운)

## Phase 19 — 합성 entity 가정 정정 (결정 61, 2026-05-19)
- [x] 사용자 검증 — 답변이 ApprovalInfo (administrator) 잘못된 화면 잡음 + SQL 잘못
- [x] 직접 분석 — 진짜 정답 = PopApprovalInfo.js (winpop) + Cmr6000Servlet (updtConfirm)
- [x] PopApprovalInfo v3 합성 (teamcd2 '3','4','6','7','8' + reqSta='0' + confdate 미수령 + 권한)
- [x] Cmr6000 v3 합성 (CMR9900 UPDATE, updtConfirm/selectDaegyul 서버 로직)
- [x] wikiV2Loader 정정 — ApprovalModal 제거, PopApprovalInfo + Cmr6000 core 추가
- [x] **결정 61: 7번째 환각 패턴 발견 — 합성 entity 가정의 사람 검증 부재**
