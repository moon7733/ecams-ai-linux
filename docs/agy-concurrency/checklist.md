# Checklist - AGY same-repo 동시성 개선

## 선행 검증

- [x] `withRepoLock` 직렬화 위치와 범위를 확인한다.
- [x] `restoreModifiedFiles`가 원본 workspace를 대상으로 동작하는지 확인한다.
- [x] 기존 shadow 격리 노트에서 AGY 셸 우회 위험을 재확인한다.
- [x] `kjbank_html5`, `kjbank_server`, `.shadow` 크기를 측정한다.
- [x] `neutralizeShadowPaths`와 `decodeJavaEscapesInShadow`가 단일 `SHADOW_ROOT`에 묶여 있음을 확인한다.
- [x] 구현 전 결론과 다음 액션을 bridge 문서에 남긴다.

## 구현 후보

- [ ] enduser RAG 요청이 AGY 소스탐색·수정 경로를 실제로 타지 않는지 E2E 로그로 확인한다.
- [ ] enduser 요청만 repo lock 밖에서 안전하게 처리 가능한지 작은 probe를 만든다.
- [x] restore 로그에 user/persona/model/jobId/repos 계측을 추가한다.
- [x] AGY `--sandbox`가 셸 도구의 원본 workspace 접근을 막는지 별도 probe한다.
- [x] sandbox 실패 결과를 bridge 문서에 남긴다.
- [ ] sandbox가 실패했으므로 슬롯 풀 전에 원본 셸 우회 방어 전략을 정한다.
- [ ] A안 슬롯 풀을 구현한다면 `SHADOW_ROOT`를 요청별 slot root로 주입하도록 함수 시그니처를 바꾼다.

## 검증 후보

- [ ] 같은 고객사 developer+enduser 동시 요청에서 enduser 대기 시간이 줄어드는지 확인한다.
- [ ] 같은 고객사 developer+developer 동시 요청에서 원본 workspace 오염이 없는지 확인한다.
- [ ] 다른 고객사 병렬 처리가 기존처럼 유지되는지 확인한다.
- [ ] `node --check server.js`를 통과한다.
