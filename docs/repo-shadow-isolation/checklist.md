# Checklist - AGY 그림자 격리

## 구현
- [x] `.gitignore`에 `.shadow/` 추가
- [x] `SHADOW_ROOT` 상수 + `shadowPathFor` 매핑 헬퍼 추가 (server.js)
- [x] `robomirror(src,dst)` — `robocopy /MIR` 비동기, 종료코드 0~7 성공 / 8+ 에러 처리
- [x] `prepareShadows(repos)` — 선택 repo + 해당 은행 wiki/indexes 미러 후 그림자 cwd/includeDirs 반환 (sync+resolve 통합)
- [x] `runAgyStream`이 `resolveGeminiPaths` 대신 `await prepareShadows` 사용
- [x] `runChatJob` AGY 분기: snapshot-restore **유지**(제거 안 함) — AGY가 그림자만 건드리니 no-op이고, 만약 경로누출로 원본을 건드려도 잡아주는 안전망. Gemini 경로 보호도 유지.
- [x] `withRepoLock` 유지 (공유 그림자 동시성 보호)

## 검증
- [x] V2 — `robocopy /MIR` 원복·purge·원본불변 실측 (HACKED→ORIG 원복, litter purge, src 불변)
- [x] V3 — 실제 `agy.exe`가 그림자에서 Read+Edit 정상 (exit 0, 그림자 .project 수정됨)
- [x] **격리 E2E** — agy.exe를 그림자 add-dir로 실행 → 그림자 .project 수정, **원본 .project 해시 불변·마커 없음** (원본 미접촉 실증)
- [x] 누출경로 점검 — repo-map `s.file`은 `path.relative` 상대경로(repoMapBuilder:421) → 누출 없음. wiki/screen_maps 절대경로 0개. **단 indexes/*.md 헤더에 절대 원본경로 존재**(누출 벡터)
- [x] **누출 차단** — `neutralizeShadowPaths`: 그림자 wiki/indexes 내용의 `C:/ecams-ai/workspace` → `.shadow/workspace` 치환. 실측: 그림자 index 누출패턴 0개, 패턴포함 파일만 덮어써 /MIR 델타 보존
- [x] 최초 동기화 지연 — kjbank_server 32MB/969파일 ~0.4s (무시 가능)
- [ ] **서버 E2E (재시작 필요)** — 실 UI에서 AGY 수정질문 → 실행 중·후 workspace `git status` 깨끗 / 분석 정상 / 같은 repo 직렬·다른 은행 병렬

## 정리
- [x] probe·테스트 잔재 제거 (scratch)
- [x] context-notes에 결정·실측치 기록
- [ ] 기존 workspace 잔재(tar-file-error-analysis docs, DBInfo.properties_back) 정리 여부 사용자 확인
