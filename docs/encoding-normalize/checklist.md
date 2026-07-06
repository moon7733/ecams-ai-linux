# 인코딩 변환 — Checklist

- [x] `encoding.js` 신규 (decodeBuffer / smartRead / isLikelyUtf8 / convertFileToUtf8 / convertRepoToUtf8)
- [x] `contextBuilder.safeRead` → smartRead 위임 (maxBytes 유지)
- [x] `server.js` 842 smartRead + `.replace(/\r\n/g,'\n')` 호출부 유지
- [x] `server.js` 873 / 1208 / 2228 smartRead 교체
- [x] `entityIndexBuilder.readSmart` → decodeBuffer 위임 (orphan iconv 제거)
- [x] `wikiBuilder.readSafe` → decodeBuffer 위임 (orphan iconv 제거)
- [x] `sqlParser` 인라인 감지 → decodeBuffer 위임 (orphan iconv 제거)
- [x] create-zip / create-git 업로드 변환 훅 (normalizeRepoEncoding, triggerIndexBuild 직전)
- [x] `scripts/convertEncodings.js` 일괄 변환 CLI (dry-run 기본, --apply)
- [x] 검증: 단위 디코딩 (EUC-KR 한글 복원 + UTF-8 멱등)
- [x] 검증: dry-run 목록 (1070건 변환예정)
- [x] 검증: --apply 실행 → 백업 1070개 생성(원본 EUC-KR 보존), 대상 utf-8, 재실행 0건(멱등)
- [x] 검증: 다운로드 회귀 (server.js:707 Buffer 읽기 미변경)
- [x] 검증: require 체인 런타임 로딩 (순환참조 없음)
- [ ] 재인덱싱 (관리자 화면에서 변경 repo 재인덱싱 — 사용자 작업)
- [ ] 읽기 경로 E2E (서버 기동 후 한글 안 깨짐 — 서버 재기동 후 확인 필요)

## 백업 위치
`D:\99. backup\encoding-convert-2026-06-29T07-54-27-902Z` (1070개 원본 EUC-KR)
