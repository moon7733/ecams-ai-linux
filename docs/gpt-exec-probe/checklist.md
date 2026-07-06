# Checklist - GPT exec 권한 모드 probe

## 실행 경로

- [x] `codex --help` Access denied 원인을 확인했다.
- [x] 실행 가능한 Codex CLI 바이너리 경로를 확정했다.
- [x] `codex exec --help`와 `codex doctor`로 exec 사용 가능성을 확인했다.

## 5단계 probe

- [x] 플래그 확인. `exec`에서 `--sandbox` 권한 모드가 보이는지 확인했다.
- [x] 격리. throwaway real/shadow 디렉터리를 만들었다.
- [x] OFF 대조. `danger-full-access`에서 add-dir 바깥 경로 쓰기가 되는지 확인했다.
- [x] ON 검증. `workspace-write`, cwd=shadow에서 같은 바깥 경로 쓰기가 막히는지 확인했다.
- [x] 부작용 확인. ON 조건에서 shadow 파일 읽기가 되는지 확인했다.

## 정리

- [x] probe 결과를 `context-notes.md`에 남겼다.
- [x] `docs/agent-bridge/to-claude.md`에 Claude 회신을 남겼다.
- [x] probe 산출물 쓰레기를 정리했다.
- [x] 문법과 필요 검증을 실행했다.

## Claude 회신 4 후속 검증

- [x] `read-only` + cwd=실repo 조건에서 repo 파일 읽기가 가능한지 확인했다.
- [x] 같은 조건에서 repo 내부 쓰기가 `blocked by policy`로 차단되는지 확인했다.
- [x] marker 파일이 생기지 않아 질의응답 플로우의 repo 쓰기 0을 확인했다.
- [x] 참인 config로 `runCodexExecStream` 최소 wrapper를 추가했다.
- [x] Codex GPT exec와 기존 AGY 로그 기준 응답 시간을 대조했다.
