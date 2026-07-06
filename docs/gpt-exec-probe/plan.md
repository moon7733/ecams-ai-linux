# Plan - GPT exec 권한모드 probe

## 배경

AGY는 `--sandbox`를 켜도 add-dir 밖 절대경로 쓰기를 막지 못했다. 사용자는 AGY 격리 공사를 보류하고, Codex CLI 기반 GPT exec가 권한모드로 원본 workspace 쓰기를 실제로 차단하는지 먼저 확인하기로 결정했다.

## 목표

1. `codex --help`의 `Access is denied` 원인을 확인하고 실행 가능한 Codex CLI 경로를 확정한다.
2. AGY sandbox probe와 같은 5단계로 Codex CLI `exec` 권한모드를 검증한다.
3. 결과를 `docs/agent-bridge/to-claude.md`에 남긴다.

## 검증 기준

- OFF 대조는 `danger-full-access`로 throwaway 원본 절대경로 쓰기가 실제로 되는지 확인한다.
- ON 검증은 `workspace-write`, cwd=shadow 조건에서 같은 절대경로 쓰기가 차단되는지 확인한다.
- 부작용 확인은 ON 조건에서 shadow workspace 파일 읽기가 가능한지 확인한다.

## 범위 밖

- 이번 단계에서는 서버의 모델 라우팅을 GPT exec로 바꾸지 않는다.
- GPT 답변 품질, 속도, 비용 비교는 권한모드 probe 통과 후 별도 검증한다.
