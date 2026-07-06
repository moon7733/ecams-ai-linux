# 인코딩 변환 — Context Notes

## 진단 (2026-06-29)
- `file -bi` 로 광주은행/산림조합/토스/하나은행 `Cmr0200.java` = iso-8859-1/unknown-8bit → 실제 EUC-KR.
- EUC-KR 디코딩 시 `//파일삭제(개발서버)`, `//체크아웃` 복원 확인.
- 깨짐 원인: 감지 로직 3곳 제각각 + `contextBuilder.safeRead` 순수 utf8.

## 결정
- 감지 단일 기준 = `TextDecoder('utf-8',{fatal:true})`. `�` 카운트 폐기 (EUC-KR이 `ü` 등 유효문자로 오인되어 누락되는 약점).
- B(읽기 시점 smartRead)와 디스크 변환은 상호 보완. B=RAG 안전망, 디스크 변환=AGY/직접 소비자용.
- 백업: `D:\99. backup\encoding-convert-<ts>\` (사용자 지정). git 미추적이라 복구 불가 → 필수.
- `server.js:682` 은 인코딩 인자 없는 Buffer(다운로드) → 건드리지 않음 (advisor 확인).

## advisor 보강
- readFileSync 개별 audit (이진/JSON config 제외).
- 멱등성: 유효 UTF-8은 바이트 무변경.
- BOM 미부여, CRLF 보존.
- vendor/ node_modules/ 스킵.
