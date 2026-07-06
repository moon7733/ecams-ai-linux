# admin-revamp 체크리스트

## 1. audit 제거
- [ ] 사이드바 "답변 검증" 버튼 제거
- [ ] openAuditModal/runAudit/refreshAuditStatus/viewAuditReport 등 JS 제거
- [ ] server `/api/admin/audit/status|run|report` 제거 + auditRunner require 제거
- [ ] auditRunner.js 삭제
- [ ] answerLogger.log(답변 로깅) 유지 확인
- [ ] 서버 기동 + 콘솔 에러 없음 → 커밋

## 2. wiki marked.js
- [ ] marked CDN 추가
- [ ] renderWikiMarkdown → marked + `[[링크]]` 후처리
- [ ] 코드블록/테이블/링크 다크 대응
- [ ] ymlee 로그인 재현 렌더 정상 → 커밋

## 3. 권한 고객사별 (live)
- [x] permissions.js 순수 모듈 (getRepoLevel/getUserRepos/getUserRepoMap, max-wins)
- [x] fixture 테스트 9개 통과 (access-flip: company-only 접근, 회수 flip, undefined 가드 등)
- [x] authMiddleware session.companies 복사 (live)
- [x] server 권한 체크/열거 지점 헬퍼 라우팅 (체크 3 + 열거/filter 5 + /api/repos)
- [x] USERS[id].companies 부여/회수 엔드포인트
- [x] company_auth 신청/승인 (#7)
- [x] 사용자관리 UI: 고객사 권한 테이블 + 개별 레포 + 고객사 추가
- [x] 권한신청(authModal) 고객사 select
- [x] 결재함 company_auth 표시
- [x] 기존 repos 보존 + undefined 가드 (마이그레이션 불필요)
- [x] 사용자관리(라이트)·권한신청(다크) 캡처 검증
- [ ] ⚠️ server.js 변경 = 재시작 필요. 재시작 후 사용자 통합 테스트 (실 로그인 권한 흐름)
