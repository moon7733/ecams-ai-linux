# admin-revamp 컨텍스트 노트

## 2026-06-10 착수
- **데이터 모델 파악**: companies.json `{id,name,address,manager}`. repos.json `{repo:{path,companyId,type}}` — 레포↔고객사 매핑 이미 존재. 실제 권한은 `USERS[id].repos[repo]=level`. requests.json은 신청 이력.
- **권한 체크 15곳**: server.js 300/324/325/372/434/489/526/547/610/621/630/711/741/853-854/882/1845-1846/2449/2524/2537. 대부분 `req.user.repos[repo]` 패턴.
- **audit 분석**: auditRunner.js LLM 호출 없음, 미검증 답변을 markdown 묶음 생성→VSCode Claude 수동 투입. `_hintWikiPaths`가 `wiki/<레포>/Pages/...` 찾는데 실제는 `wiki/<고객사>/<레포>/...` → 힌트 거의 실패. answerLogger.markAudited/iterUnauditedLogs는 audit 전용, log는 답변 기록(유지).
- **wiki 버그 실증**: ymlee 로그인 재현(shot-wiki.js) → 렌더 깨짐. `renderWikiMarkdown`(index.html ~4700) 처리 순서: 테이블(`|`) 처리가 위키링크(`[[A|B]]`) 변환보다 먼저 → 링크의 `|`를 셀 구분자로 오인 → `'); return false;"...` 원시 HTML 노출. 콘텐츠(Main.md 23개)·권한·통신은 정상.
- **사용자 결정**: audit 제거 / wiki marked.js / 권한 live.

## advisor 가이드 (반영)
- 권한: read-site 많음(15) → 옵션 B(고객사 선택→레포 확장). live 선택했으므로 `getRepoLevel(user,repo)` 헬퍼로 라우팅(repos[repo] ?? companies[companyId]). `USERS[id].companies`도 저장해 표시/회수. 기존 repos 보존.

## 구현 완료 (2026-06-10)
- **검증 갭(advisor 핵심)**: 서버 권한 로직은 스크린샷 불가 + :5000 재시작 불가(사용자 프로세스). audit 제거도 서버측은 미검증(사이드바 버튼만 봄). → **permissions.js 순수 모듈 + fixture 테스트**로 access-flip 검증.
- **permissions.js**: `getRepoLevel`(repos[repo] max-wins companies[cid]), `getUserRepos`(개별+고객사 확장 — 열거 지점 silent-failure 방지), `getUserRepoMap`. precedence = **max-wins**(고객사 edit가 개별 read 업그레이드). live = request-time `LOCAL_REPOS[repo].companyId` 조회 + authMiddleware 가 매 요청 session.repos/companies 를 USERS 와 동기화하므로 새 레포·새 grant 모두 다음 요청 반영.
- **fixture 9개 통과**: company-only 접근, 회수 flip, companyId 없는 레포 매칭 안 됨, max-wins 양방향, getUserRepos 확장, undefined 가드(레거시 유저 companies 없음).
- **server wiring**: 권한 체크 3곳(getRepoLevel) + 열거/filter 5곳(candidates/allowedRepos/userRepos/cachedRepos) + /api/repos(getUserRepoMap). company 부여/회수 엔드포인트 + company_auth 신청/승인.
- **UI**: 사용자관리 고객사 권한 테이블 + 개별 레포(있을 때만) + 고객사 추가 select. 권한신청 고객사 select(/api/companies). 결재함 company_auth 표시. `.modal-card button{width:100%}` 회피 위해 동적 버튼에 width:auto.
- **통합 검증 완료 (별도 포트 5001)**: advisor 지적 — fixture는 헬퍼 단위만, 스크린샷은 주입 프론트 상태라 실제 권한 요청 미실행. → users.json 백업 후 ymlee에 토스 read 임시 부여 → `PORT=5001 node server.js` → ymlee 로그인 → GET /api/repos. **회귀 PASS**(기존 repos kjbank_html5/nhcard_html/hana_html5 그대로) + **기능 PASS**(토스 company → toss_html5/toss_server=read 자동 확장). 검증 후 users.json 원복 + 5001 종료. 5000 라이브 무영향(read-path만, grant/revoke 미실행 — saveUsers 레이스 회피).
- **⚠️ 사용자 재시작 필요**: 위 검증은 코드가 옳음을 증명하나, 사용자의 5000 라이브 인스턴스는 재시작해야 변경 반영.
- **non-blocking 노트**: ① `DELETE /api/admin/companies/:id` 가 `USERS[*].companies[deadId]` 를 정리 안 함 → dangling 엔트리(보안 아님, 죽은 고객사라 레포 참조 없음). ② answerLogger 의 countUnaudited/markAudited 는 audit 제거 후 dead export(무해). 결재함 company_auth 행은 렌더 코드만 추가(직접 캡처 생략, 동일 패턴).
