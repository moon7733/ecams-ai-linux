# Plan - AGY same-repo 동시성 개선

## 배경

같은 고객사 repo를 선택한 AGY 요청은 `requestQueue`의 전체 병렬 슬롯 3개와 별개로 `withRepoLock`에서 repo별 직렬화된다. 이 설계는 공유 `.shadow` 미러와 snapshot-restore 간섭을 막기 위한 방어선이지만, 느린 developer 요청 하나가 같은 고객사의 enduser 요청을 최대 5분 막는 UX 문제가 있다.

## 이번 목표

바로 구현하지 않고, 기존 shadow 격리 구조에서 같은 repo 병렬화를 안전하게 풀 수 있는지 선행 검증한다.

1. `restoreModifiedFiles`가 그림자 격리 이후에도 원본 보호에 실효가 있는지 확인한다.
2. `.shadow` 슬롯 풀을 만들 경우 디스크 비용이 감당 가능한지 확인한다.
3. 슬롯별 shadow root로 바꿔도 경로 중화와 Java escape 디코딩이 안전하게 동작하는지 확인한다.
4. 다음 구현 선택지를 위험도 순으로 정리한다.

## 검증 기준

- 코드 근거로 B안(락 제거)의 안전 여부를 판단한다.
- 실제 repo와 `.shadow` 크기를 측정해 A안(슬롯 풀)의 비용을 숫자로 남긴다.
- 기존 `repo-shadow-isolation` 결정과 충돌하지 않는 다음 액션을 남긴다.

## 범위 밖

- 이번 단계에서는 `server.js` 동시성 구현을 바꾸지 않는다.
- AGY의 셸 도구가 원본을 우회 접근하는 문제를 해결하지 않은 상태에서 same-repo lock을 제거하지 않는다.
- 대화기록 서버 저장 UX(#1)와 개별 메시지 삭제(#3)는 별도 feature로 다룬다.
