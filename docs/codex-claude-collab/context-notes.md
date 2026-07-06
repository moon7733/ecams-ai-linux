# Codex + Claude Code 협업 결정 기록

## 2026-07-01

- eCAMS AI 개발을 최우선 목표로 두고 Codex와 Claude Code를 함께 사용하기로 했다.
- 사용자는 Claude Code에서 Opus 모델을 사용 중이라고 했다.
- 역할 분담은 Codex가 로컬 실행, 작은 수정, 문서 갱신, 검증을 주로 맡고 Claude Code Opus가 큰 설계 판단과 깊은 리뷰를 맡는 방향으로 정했다.
- 문제가 있을 때는 바로 구현하지 않고, 원인 가설과 검증 계획을 세운 뒤 두 에이전트가 검토하고 합의한 다음 개발하는 방식을 채택했다.
- 토큰 절약용으로 이미 설치된 `caveman`, `cavecrew`, `caveman-review`, `caveman-commit`, `caveman-compress`, `caveman-stats`를 확인했다.
- 현재 추가 설치가 꼭 필요한 토큰 절약 스킬은 발견하지 못했다.
- 긴 세션의 컨텍스트 소모를 줄이기 위해 위치 탐색과 짧은 리뷰에는 `cavecrew` 계열을 우선 고려한다.
