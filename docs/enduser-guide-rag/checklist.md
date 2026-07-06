# Enduser Guide RAG 체크리스트

## 파서 검증 (3a 착수 전)
- [x] `npm install officeparser`
- [x] 실제 한글 PPTX(`scratch/eCAMS_AI_UserGuide.pptx`) 파싱 → 52청크, 한글 정상
- [x] `ast.to('chunks')` 내장 청킹 동작 확인 → 직접 청킹 불필요

## 3a 백엔드
- [x] knowledgeManager: `addGuideChunks` / `getGuideKnowledge` (별도 `_guide.json` store)
- [x] knowledgeManager: export 갱신
- [x] server.js: import + `officeParser` require
- [x] buildPrompt 배선 — enduser → `getGuideKnowledge`, developer 무손상
- [x] `ingestGuideDoc` (파싱→병합 ~800자→addGuideChunks)
- [x] `POST /api/admin/guides/upload` (multer 재사용 + 백그라운드 인제스트 + 한글 파일명 복원)
- [x] `node --check` 양쪽 통과
- [x] 부팅 스모크(officeparser require 포함) 통과
- [x] E2E 파싱→병합→저장방어 검증 (임베딩은 환경 네트워크 차단으로 검증 불가, 기존 함수 재사용)
- [x] 3a 커밋 (`ba682aac` + polish `a6a54478`)

## 3b 프론트엔드
- [x] 관리자 도구에 "가이드 문서 업로드" 메뉴 (사이트 선택 + 파일 업로드)
- [x] 업로드 → `/api/admin/guides/upload` 호출 + 결과 표시
- [x] 인라인 스크립트 문법 검증
- [x] 3b 커밋

## 업로드 버그 수정 (2026-06-29, 실제 업로드 테스트에서 발견)
- [x] `.docx/.pptx/.pdf` 인제스트 실패 — multer 임시파일 확장자 누락 → ext rename 부여 (`8aa1bcf1`)
- [x] 모달 메시지 미표시 — `.modal-error` 기본 `display:none` → 표시 시 `display:block` 토글 (`aa898501`)
- [x] 구형 `.ppt/.doc` 선택 시 무반응 → 클라이언트 가드 + 변환 안내 메시지 (`8aa1bcf1`)

## E2E 운영검증 (2026-06-29, 운영서버에서 완료)
- [x] customer 계정(djsun)으로 가이드 질문 → `[Persona] enduser`, `topSim=0.727`, 5청크/4290자 hit
- [x] 답변 화면 절차 중심 + 소스/diff 누출 0 확인 (ENDUSER_DIRECTIVE 작동)
- [x] 멀티모달(알럿창 사진 첨부) 처리 정상 (agy code=0)
- [x] enduser 가이드 검색 진단 로그 추가 (`95850958`)

## 잔여 (다음 세션)
- [ ] **B. 답변 정확성 검증** — "프로그램 종류(확장자) 미등록" 이 `CheckOut.js` 알럿("형상관리 대상 프로그램이 없습니다")의 실제 트리거인지 코드 추적. 알럿 문자열이 코드상 변수조합/인코딩으로 쪼개져 있어 grep content 안 잡힘 → 트리거 조건 끝까지 따라가야 함. 가이드 5청크 근거 vs agy 코드 추론 구분 필요.
- [ ] (deferred) enduser 코드 컨텍스트(wiki/repo-map) 억제 — 가이드 충분히 쌓인 뒤
- [ ] (deferred) 관리자용 가이드 현황/삭제 UI
