# 소스뷰어 업그레이드 — Checklist

## Req1 — 모바일 키보드 억제
- [x] `src/cm-entry.mjs` baseExtensions 에 `EditorView.contentAttributes.of({ inputmode: 'none' })` 추가
- [x] `npm run build:cm` (번들에 inputmode 포함 확인)
- [ ] (실기기) iOS/안드로이드에서 터치 시 키보드 안 뜸 확인 — 사용자 검증 필요

## Req2 — 파일칩 라인범위
- [x] `buildFileChip` 에서 `#L<start>(-L<end>)?` 프래그먼트 분리 후 relPath 계산 (fileName 은 접미사 없는 원본 유지)
- [x] `openFileFromChip` / `svReadFile` 에 startLine·endLine 인자 전달
- [x] `cm-entry.mjs` 에 `gotoLineRange(from, to)` export + 클라 `svFlashSelection`(2.5초 amber)
- [x] `npm run build:cm`
- [ ] AI가 `#L155-L172` 명시한 칩 클릭 → 파일 열림 + 범위 하이라이트 확인 — 브라우저 검증 필요

## Req3 — 파일 단위 분석
- [x] 서버: `POST /api/fs/analyze` (lean claude 스폰, 80KB 상한)
- [x] UI: sv-header 에 "소스분석" 버튼
- [x] UI: sv-content 분할 패널(데스크탑 좌우 / 모바일 상하) + 분석중 플로팅
- [x] 분석 결과 `formatContent()` 로 마크다운 렌더
- [x] pm2 재시작 + 엔드포인트 JSON 응답(401) 확인 + claude CLI 단발 동작 확인
- [ ] 로그인 후 실제 분석 버튼 E2E — 사용자 검증 필요

## Req4 — 드래그 영역 질문
- [x] `cm-entry.mjs` 에 `getSelection()` export (번들 확인)
- [x] 데스크탑 우클릭 컨텍스트 버튼 / 모바일 선택 직후 버튼 (svMaybeShowAskSelection)
- [x] 선택영역 → `/api/fs/analyze` (question=선택) → 동일 패널 표시
- [x] `npm run build:cm` + pm2 재시작
- [ ] 드래그 후 버튼 노출·분석 E2E — 브라우저 검증 필요

## 마무리
- [ ] 전체 E2E (데스크탑/모바일) — 로그인 토큰 필요, 사용자 검증 대기
- [ ] 시맨틱 커밋 (단계별) — 현재 브랜치가 feature/clarify-scope-gate 라 별도 브랜치 권고
