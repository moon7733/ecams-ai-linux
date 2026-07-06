# 소스뷰어 리눅스 경로 호환 컨텍스트 노트

## 2026-07-06 진단

- 사용자가 리눅스 전환 후 소스뷰어가 안 되고, AGY 답변의 소스 언급을 눌러 소스뷰어로 여는 기능도 빠진 것 같다고 보고했다.
- `repos.json`에는 레포 경로가 모두 `C:/ecams-ai/workspace/...`로 저장되어 있다.
- 서버의 `/api/fs/list`, `/api/fs/read`, `/api/fs/search`는 `repos.json`의 path를 그대로 `path.resolve`에 넣는다. 리눅스에서 이 경로가 없으면 소스뷰어 트리와 파일 읽기가 실패한다.
- 프론트 `buildFileChip`은 `file:///C:/ecams-ai/{workspace|wiki|indexes}/...` 정규식만 인식한다. AGY가 리눅스 절대경로나 `.shadow/workspace/...` 링크를 내면 클릭 가능한 칩이 되지 않는다.
- AGY shadow 미러는 `robocopy` 전용이다. 리눅스에서 `prepareShadows`가 실패하면 AGY 질문 자체 또는 소스 접근도 깨질 수 있다.

## 결정

- `repos.json`을 즉시 대량 수정하지 않고, 서버 런타임에서 레거시 경로를 현재 환경 경로로 해석한다. 기존 Windows 배포와 리눅스 배포를 동시에 살리기 위해서다.
- `WORKSPACE_DIR`가 있으면 workspace 루트로 우선 사용하고, 없으면 `__dirname/workspace`를 사용한다.
- 프론트는 특정 설치 루트명에 의존하지 않고 `workspace`, `wiki`, `indexes` 세그먼트를 찾아 파싱한다.

## 2026-07-06 수정

- `pathUtils.js` 추가. `C:/ecams-ai/workspace/...`, `/opt/.../workspace/...`, `workspace/...`를 현재 앱 루트 또는 `WORKSPACE_DIR` 기준으로 해석한다.
- 서버 `/api/fs/list`, `/api/fs/read`, `/api/fs/search`, `/api/fs/apply-diff`, 관리자 인덱스 API, AGY repo roots, Graphify 보조 경로가 `getRepoBasePath()`를 쓰게 바꿨다.
- `prepareShadows`는 Windows에서 기존 `robocopy`를 유지하고, 리눅스에서는 Node 기반 미러를 사용한다. 제외 디렉토리와 제외 파일 패턴은 기존 목록을 재사용한다.
- `buildFileChip`은 `file:///C:/...`, `file:///home/...`, `.shadow/workspace/...`, `workspace/...` 모두에서 `workspace/wiki/indexes` 세그먼트를 찾아 칩을 만든다.
- 코드블록과 본문 경로 마스킹은 Windows 고정 루트가 아니라 `workspace/wiki/indexes` 세그먼트 기반으로 확장했다.

## 검증 결과

- `node --check server.js` 통과.
- `node --check contextBuilder.js` 통과.
- `node --check pathUtils.js` 통과.
- `node --check scripts/rebuildAllIndexes.js` 통과.
- `node --check scripts/deadCodeDetector.js` 통과.
- `public/index.html` 인라인 스크립트 2개 `new Function` 파싱 통과.
- `pathUtils` 샘플 경로 변환과 `isPathInside` 확인 통과.
- `npm run build:cm`은 실패. 원인: 현재 작업공간에 `node_modules`와 `esbuild`가 설치되어 있지 않음. 이번 수정은 `src/cm-entry.mjs`를 건드리지 않아 번들 재생성은 필요하지 않다.
