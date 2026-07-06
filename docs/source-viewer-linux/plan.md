# 소스뷰어 리눅스 경로 호환 계획

## 목표

Windows `C:/ecams-ai/...` 기준으로 저장·출력되던 레포 경로와 파일 링크가 리눅스 배포에서도 소스뷰어, 파일칩 클릭, AGY 그림자 실행에 정상 연결되게 한다.

## 범위

1. 서버에서 `repos.json`의 레거시 Windows 경로를 현재 실행 루트 또는 `WORKSPACE_DIR` 기준 경로로 해석한다.
2. `/api/fs/list`, `/api/fs/read`, `/api/fs/search`, diff 적용, AGY shadow 준비가 동일한 경로 해석기를 쓰게 한다.
3. AGY shadow 미러가 Windows 전용 `robocopy` 없이 리눅스에서도 동작하게 한다.
4. 프론트 파일칩 파서가 Windows `file:///C:/...`, 리눅스 `file:///.../workspace/...`, 상대 `workspace/...` 경로를 모두 clickable로 만든다.
5. 관련 문서와 검증 결과를 남긴다.

## 검증

- `node --check server.js`
- `npm run build:cm`
- 프론트 파일칩 파서 로직 단위 확인
- 서버 경로 해석 로직 단위 확인
