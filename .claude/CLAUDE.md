# CLAUDE.md

@../AGENTS.md

---

위 import 로 공통 행동 가이드라인 (`AGENTS.md`)을 그대로 따른다.

Claude Code 전용 추가 규칙이 필요하면 이 줄 아래에 append.

## eCAMS bridge 명령 규칙

사용자가 `ecams 진행해줘`, `/ecams 진행해줘`, 또는 단순히 `진행해줘`라고 말하면 먼저 `docs/agent-bridge/current.md`를 읽고 Claude 담당 다음 액션을 진행한다.

이미 `docs/agent-bridge/decisions.md` 또는 `current.md`에 합의된 범위 안에서는 추가 승인 요청 없이 구현, 검증, 커밋까지 진행한다.

불확실하거나 합의 범위를 벗어나거나 위험한 변경이면 그때만 사용자에게 묻는다.

새 문제나 새 수정사항은 `ecams 새작업: ...` 형식으로 받는다. 이때는 기존 bridge 작업과 충돌하는지 확인하고, 작으면 바로 진행하며, 크면 필요한 plan/checklist/context-notes를 만든다.

합의 정리는 `ecams 합의해줘` 또는 `/ecams 합의 진행해줘` 형식으로 받는다. 이때는 `docs/agent-bridge/to-codex.md`와 관련 bridge 문서를 읽고 합의안을 정리한다.

필요하면 `docs/agent-bridge/to-claude.md`와 `docs/agent-bridge/to-codex.md`도 확인한다.
