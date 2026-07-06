# Enduser Guide RAG Context Notes

## 결정 76 (2026-06-09) — 가이드는 별도 store (advisor 강력 권고로 옵션 A→B 전환)
- 처음엔 같은 store + `type='guide'` 태그(옵션 A) 고려 → advisor 가 옵션 B(별도 파일)로 정정.
- 결정적 이유. `addKnowledge` 가 500개 초과 시 front-splice([knowledgeManager.js:191](../../knowledgeManager.js)). 가이드를 같은 파일에 넣으면 큰 PPT 하나가 개발자 QA 지식을 통째 밀어냄.
- 부수 이점. `getRelevantKnowledge`(개발자 매 질문 hot path) 한 글자도 안 건드림 → 회귀 0. add/score 경로가 어차피 다름(가이드는 청크 본문 임베딩, 기존은 question 임베딩).
- 구현. `knowledge/<repoId>_guide.json`, `addGuideChunks`/`getGuideKnowledge`. cap 별도(3000). 임베딩 실패 청크는 저장 안 함(half-write 방지).

## 결정 77 (2026-06-09) — officeparser 단일 의존성
- v6 `parseOffice()` → AST → `ast.to('chunks'|'md')`. PDF/DOCX/PPTX 통합, 내장 청킹 제공.
- 실제 한글 PPTX 로 파싱 검증 완료(52청크). 폴백(pdf-parse+mammoth) 불필요.
- 청킹. 내장 청크가 슬라이드/요소 단위라 잘게 나뉨(800자 chunkSize인데 52개) → server `ingestGuideDoc` 에서 인접 병합으로 ~800자 단위 재구성.

## 결정 78 (2026-06-09) — enduser retrieval 은 가이드 only
- enduser → `getGuideKnowledge` 만 주입. 개발자 QA/코드 지식(`getRelevantKnowledge`)은 enduser 에게 노출 안 함(소스 누출 방지와 일관).
- developer → 기존 경로 그대로.

## 검증 한계 (재현 메모)
- 이 작업 환경은 외부 HTTPS 가 인프라 레벨 차단 → `getEmbedding` 이 NULL. 임베딩+검색 E2E 는 검증 못 함.
- 검증된 것. 파싱(한글 OK), 청크 병합(2청크), half-write 방지(임베딩 null → 0개 저장 확인).
- 미검증. 실제 임베딩/검색 — 단 동일 `getEmbedding` 이 시맨틱 캐시·QA 지식에 운영 중이므로 함수는 정상. 운영 배포 후 가이드 업로드 1건으로 최종 확인 필요.

## 보류 (deferred, not forgotten)
- enduser 코드 컨텍스트(wiki/repo-map) 억제 — 가이드 빈 초기엔 코드 컨텍스트가 있어야 답이 나옴. 출력 통제는 ENDUSER_DIRECTIVE 담당. 가이드 충분히 쌓이면 후속으로 buildPrompt 에서 억제.
- 관리자용 가이드 현황/삭제 UI — 이번엔 업로드만. 조회/삭제는 후속.

## 결정 80 (2026-06-29) — 실제 업로드 테스트에서 3개 버그 발견·수정
사용자가 운영서버에서 직접 가이드 업로드를 돌려보며 발견. (이전까지 "미검증"이던 임베딩/검색 경로가 여기서 처음 실제로 검증됨.)
- **버그1 — 인제스트 실패(`8aa1bcf1`)**: officeParser 는 확장자로 파일 타입을 판별하는데 multer `dest:` 가 확장자 없는 해시 이름(`a26f282c...`)으로 저장 → 모든 docx/pptx/pdf 가 `supports docx/pptx/... only` 로 백그라운드 인제스트에서 죽음. 라우트에서 이미 검증된 `ext` 를 `fs.renameSync(req.file.path, req.file.path+ext)` 로 붙여 해결. (3a "E2E 검증"이 확장자 붙은 원본 경로로만 테스트해서 못 잡았던 케이스 — 실제 multer 임시파일 경로는 검증된 적 없었음.)
- **버그2 — 모달 메시지 미표시(`aa898501`)**: `guideUploadMsg` 가 `.modal-error`(기본 `display:none`) 라 `textContent` 만으론 성공/실패/가드 메시지가 전혀 안 보임. docx 성공 메시지도 원래 안 보였던 것(파일만 사라짐). 다른 모달처럼 표시 시 `display:block` 토글하는 로컬 `show()` 헬퍼로 통일.
- **버그3 — 구형 ppt/doc 무반응**: officeParser 원천 미지원(docx/pptx/xlsx/pdf/...). 클라이언트에서 `.pdf|docx|pptx` 정규식 가드 + 변환 안내 메시지로 즉시 차단.

## 결정 81 (2026-06-29) — enduser persona + 가이드 RAG E2E 운영검증 성공
- customer 계정(djsun)으로 멀티모달 질문(알럿창 사진 + "이 알럿 언제 뜨나요"). 로그.
  `[Guide] Injecting 5 chunk(s), topSim=0.727` / `[Persona] enduser — 가이드 검색: 4290자 hit` / `[agy] code=0 answerLen=506`.
- 3 signal 판정. ① persona=enduser 정확 분기 ② topSim 0.727 > 임계 0.65, 5청크 hit ③ 답변 화면절차 중심 + 소스/Servlet/diff 누출 0(ENDUSER_DIRECTIVE 작동). → 운영 가능 확정.
- 관측용 진단 로그 추가(`95850958`): buildPrompt enduser 분기에 `[Persona] enduser — 가이드 검색: N자 hit / miss(임계 0.65)`.

## 결정 82 (2026-06-29) — agy 영문 프리앰블 누출 제거 (stripAgyPreamble, `182e3ea8`)
- 위 테스트 답변 맨 앞에 `"I will wait for the search command to complete..."` 영문 계획 멘트가 노출됨. 답변이 506자(>300)라 기존 `isAgyBail` 에 안 걸림(bail 은 전체가 짧은 영문 placeholder인 경우만).
- 형태. **영문 프리앰블(prefix) + 정상 한글 답변**. 정상 답변은 항상 한글 섹션(1. 한 줄 요약 / ## 0)으로 시작.
- 수정. `stripAgyPreamble` — 본문에 한글이 있을 때만 "첫 한글 라인 이전 영문 라인"을 제거. 순수 영문(한글 0)은 손대지 않아 `isAgyBail` 재시도 경로 무손상. [server.js:1894] `clean = stripAgyPreamble(stripAnsi(buf).trim())` 단일지점 적용 → 스트리밍·반환 양쪽 커버. 3케이스 단위테스트 통과.
- 주의. agy 비결정성이라 프리앰블이 매번 나오진 않음 — 재현엔 반복 필요.

## 다음 세션 진입점 (B. 답변 정확성 검증)
- 질문. "형상관리 웹 체크인 화면에서 SR(00-000000-00) 선택 시 뜨는 'ERROR 형상관리 대상 프로그램이 없습니다' 알럿이 언제 뜨나" → agy 답: "선택 시스템에 프로그램 종류(확장자) 미등록".
- 검증 과제. 이 설명이 실제 코드 트리거와 맞는지. 알럿 문자열은 `workspace/광주은행/kjbank_html5/WebContent/js/ecams/dev/CheckOut.js` 에 있으나(`files_with_matches` 로 확인), grep content 로는 안 잡힘 → 문자열이 변수조합/인코딩으로 쪼개진 듯. 트리거 조건(어느 함수, 어떤 데이터 조건)을 끝까지 추적해서 가이드 근거인지 agy 추론인지(환각 여부) 판정 필요.
