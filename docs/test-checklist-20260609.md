# 테스트 체크리스트 & 핸드오프 (2026-06-09 작업분)

> 2026-06-09(화) 구현. **테스트는 수요일(6/10) 이후** 운영/로컬에서 진행.
> 코드 검증은 `node --check`(3파일) + 서버 부팅 스모크까지만 됨. 실제 동작·UI·임베딩은 미검증.

---

## 1. 이번에 들어간 것 (커밋 6개)

| 커밋 | 기능 |
|---|---|
| `4381c524` | persona 라우팅 (소속 기반 enduser/developer 응답 분기) |
| `5976e21e` | 후보선택 캐시 UX (0.80~0.95 유사 질문 후보 제시) |
| `0005602d` | 가이드 RAG 백엔드 (문서 인제스트 + persona별 retrieval) |
| `7e37d6b2` | 가이드 업로드 UI (관리자 메뉴) |
| `8adba5b4` | 보안 fix (답변 캐시 persona 분리) |
| `e82b8b14` | polish (truncation 상향 + postChat 더블파이어 가드) |

상세 결정 근거: `docs/persona-routing/`, `docs/candidate-cache-ux/`, `docs/enduser-guide-rag/` (결정 71~79).

---

## 2. 수요일 이후 테스트할 항목

### A. persona 라우팅
- [ ] **개발자 계정**(admin/ymlee/azsoft)으로 질문 → 기존처럼 소스/Servlet/diff 포함 답변이 나오는가 (회귀 없음 확인).
- [ ] **고객사 계정**(`userType: customer`) 생성/로그인 → 같은 질문에 **소스·코드·diff 없이 화면 절차(1.2.3. 단계)** 로 답하는가.
- [ ] admin 이 사용자 관리에서 userType 바꾸면 응답 방식이 바뀌는가.
- 테스트용 customer 계정이 없으면 신규 가입(소속에 "(주)아즈소프트" 외 입력) → 승인.

### B. 후보선택 캐시 UX
- [ ] 같은 질문 2번 → 2번째 즉시 캐시 응답(기존 동작).
- [ ] **비슷하지만 다른 표현**의 질문 → "💡 비슷한 질문이 있었어요" 후보 목록이 뜨는가.
- [ ] 후보 클릭 → 해당 캐시 답변이 즉시 표시되는가.
- [ ] "🔄 모두 다른 질문이에요 (새로 분석)" → LLM 이 새로 도는가.
- [ ] 후보가 0.95 이상이면 후보 안 뜨고 바로 자동 반환되는가.
- ⚠️ 캐시가 비어있으면 후보 안 뜸 — 먼저 질문 몇 개 쌓고 테스트.

### C. 가이드 RAG (가장 중요 — 유일하게 코드검증 못 한 부분)
- [ ] 관리자 메뉴 "📄 가이드 업로드" → 사이트 선택 + PDF/Word/PPTX 업로드 → "업로드 완료" 뜨는가.
- [ ] 서버 로그에 `[Guide] 인제스트 완료 — <repo> ← "<파일>": N개 청크` 가 찍히는가. **(N=0 이면 임베딩 실패 — 키/네트워크 확인)**
- [ ] `knowledge/<repo>_guide.json` 파일이 생성되고 vector 가 들어있는가.
- [ ] **그 사이트 소속 customer 계정**으로 가이드 내용 관련 질문 → 가이드 기반 답변이 나오는가.
- [ ] 개발자 계정 질문엔 가이드가 안 섞이는가 (`_knowledge.json` QA 지식만).

### D. 보안 — 캐시 persona 분리
- [ ] 개발자가 질문해 캐시 생성 → **같은 질문을 customer 계정**이 물었을 때 개발자의 소스 답변이 **안 나오고** enduser 답변으로 처리되는가. (이게 핵심 — 소스 누출 차단)

---

## 3. 새 세션에서 UI 작업 시 진입점

UI 는 전부 `public/index.html` 단일 파일.

- **채팅 전송/응답 처리**: `sendMessage()` → `postChat(ctx, forceFresh)` (fetch + cached/candidates/job 분기).
- **캐시/후보 답변 렌더**: `renderCachedAnswer()`, `renderCandidates()`, `selectCandidate()`.
- **관리자 메뉴 버튼**: `#adminMenu` div (라인 1601 부근).
- **가이드 업로드 모달**: `#guideUploadModal` + `openGuideUploadModal()` / `uploadGuide()`.
- **모달 표시/숨김**: `openModal(id)` / `closeModal(id)` (style.display flex/none).
- **공통 헬퍼**: `fetchWithAuth()`, `escHtml()`, `appendLoading()`, `appendMessageDOM()`, `formatContent()`.
- 인라인 스크립트 문법 검증 한 줄:
  ```
  node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,c='';while((m=re.exec(h)))c+=m[1]+'\n;\n';fs.writeFileSync('/tmp/_c.js',c);require('child_process').execSync('node --check /tmp/_c.js');console.log('OK')"
  ```

---

## 4. 알려진 미결 / 보류

- ⚠️ **가이드 임베딩 E2E 미검증** — 작업 환경 외부 HTTPS 차단으로 못 돌림. 운영에서 위 2-C 로 확인 필요.
- enduser 코드 컨텍스트(wiki/repo-map) 억제 — 보류(가이드 쌓이면).
- 관리자 가이드 현황/삭제 UI — 미구현(업로드만).
- 아이디어 2 (파일→DB) — 설계만, 코드 미착수. SQLite 권장, workspace 소스는 DB 이관 X.
