# 관리자/권한 개편 (admin-revamp)

## 배경
사용자 요청 3건 (2026-06-10). UI 수정(#1·#2·#4)은 별도 완료(ui-refresh 커밋). 본 문서는 기능 변경 3건.

## 결정 (사용자 확정)
1. **답변검증(audit) 제거** — wiki 의존 + 힌트 경로버그(`wiki/<레포>` vs 실제 `wiki/<고객사>/<레포>`) + 수동 워크플로우 + wiki PoC 막다른길. 효용 낮음. answerLogger(답변 로깅)는 유지.
2. **LLM Wiki marked.js 교체** — 콘텐츠/통신 정상, `renderWikiMarkdown` 정규식 렌더러 버그(테이블 처리가 위키링크보다 먼저 → `[[A|B]]`의 `|` 오인 → 원시 HTML 노출). marked.js + 위키링크 후처리로 교체.
3. **권한 레포별 → 고객사별 (live)** — 옵션 B+헬퍼. `repos` 권한 체크가 server 15곳. live(새 레포 자동 반영) 선택 → `getRepoLevel(user, repo)` 헬퍼로 라우팅, 헬퍼가 `repos[repo]` 또는 `companies[repo의 companyId]` 확인.

## 단계 (각 단계 커밋)
1. **audit 제거** — 사이드바 버튼, openAuditModal/runAudit/refreshAuditStatus/viewAuditReport JS, server `/api/admin/audit/*` 3엔드포인트, auditRunner.js. answerLogger.log 유지.
2. **wiki marked.js** — marked CDN, renderWikiMarkdown 재작성(marked + `[[...]]` 후처리 + 코드/링크 다크 대응).
3. **권한 고객사별 live** — (advisor 점검 후) 데이터 `USERS[id].companies`, `getRepoLevel` 헬퍼, 15곳 라우팅, 사용자관리/권한신청 UI 고객사 단위. 기존 `repos` 보존.

## 검증
- audit 제거: 서버 기동 + 사이드바/콘솔 에러 없음.
- wiki: ymlee 로그인 재현(shot-wiki.js)으로 렌더 정상 확인.
- 권한: 고객사 부여 → 해당 레포 접근 가능 + 새 레포 추가 시 자동 반영(live) 검증.
