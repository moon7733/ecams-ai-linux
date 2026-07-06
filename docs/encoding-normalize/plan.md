# 인코딩 자동 변환 (EUC-KR → UTF-8) — Plan

## 배경
eCAMS 워크스페이스의 고객사 소스가 UTF-8 / EUC-KR(CP949) 로 섞여 있어, LLM 컨텍스트에 EUC-KR 파일이 깨진 채 전달된다. 원인은 인코딩 감지 로직이 3곳에 제각각(`entityIndexBuilder.readSmart`, `wikiBuilder.readSafe`, `sqlParser` 인라인)이고 핵심 본문 리더 `contextBuilder.safeRead`는 순수 `'utf8'`인 점.

## 목표
1. **B방식** — 소스 읽는 지점 전부를 공용 `smartRead`로 통일.
2. **기존 변환** — 워크스페이스 파일 디스크 일괄 UTF-8 변환 + 재인덱싱.
3. **업로드 변환** — zip 해제/clone 직후 파일 자체를 UTF-8로 변환 후 인덱싱.

## 핵심 설계
- 공용 모듈 `encoding.js`: `decodeBuffer` / `smartRead` / `isLikelyUtf8` / `convertRepoToUtf8`.
- 감지는 `TextDecoder('utf-8',{fatal:true})` 단일 기준. 유효 UTF-8 통과(멱등), 실패 시 EUC-KR.
- 디스크 변환은 EUC-KR 감지분만, 원본을 `D:\99. backup\encoding-convert-<ts>\` 에 백업 후 덮어씀(BOM 없음, CRLF 보존).

## 백업
`D:\99. backup\encoding-convert-<timestamp>\` 아래 워크스페이스 상대경로 그대로 복사.

## 가정
- 워크스페이스는 분석 전용 복사본(AGY는 그림자 복사본 실행) → 디스크 변환이 빌드 안 깸.
- 워크스페이스 파일 git 미추적 → 백업 필수.

상세는 승인된 계획서(`~/.claude/plans/wondrous-painting-waffle.md`) 참조.
