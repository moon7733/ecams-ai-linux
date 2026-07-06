# Agent Bridge 사용법

Codex와 Claude Code가 긴 내용을 채팅으로 복붙하지 않고 같은 레포 안에서 공유하기 위한 공용 우편함이다.

## 파일 역할

- `current.md`는 현재 작업 상태와 다음 액션을 한눈에 보는 파일이다.
- `to-claude.md`는 Codex가 Claude Code에게 넘기는 검토 요청이다.
- `to-codex.md`는 Claude Code가 Codex에게 돌려주는 검토 결과다.
- `decisions.md`는 합의된 결정만 누적하는 기록이다.

## 사용자 명령

Codex에게 보낼 때.

```text
/ecams 핸드오프 만들어줘.
```

Claude Code에게 보낼 때.

```text
docs/agent-bridge/to-claude.md를 읽고 검토한 뒤 docs/agent-bridge/to-codex.md에 답을 써줘.
```

Codex에게 다시 보낼 때.

```text
/ecams 합의 진행해줘. docs/agent-bridge/to-codex.md 읽어.
```

## Codex 응답 규칙

Codex는 bridge 파일을 만들거나 갱신한 뒤 사용자에게 반드시 다음 행동 한 줄을 같이 알려준다.

예를 들어 Claude 검토가 필요하면 아래처럼 말한다.

```text
다음에는 Claude Code에 이 한 줄만 보내면 됩니다.
docs/agent-bridge/to-claude.md를 읽고 검토한 뒤 docs/agent-bridge/to-codex.md에 답을 써줘.
```

Claude 답변을 받은 뒤 Codex 합의가 필요하면 아래처럼 말한다.

```text
다음에는 Codex에 이 한 줄만 보내면 됩니다.
/ecams 합의 진행해줘. docs/agent-bridge/to-codex.md 읽어.
```

구현으로 바로 넘어가도 되는 상태면 아래처럼 말한다.

```text
다음에는 Codex에 이 한 줄만 보내면 됩니다.
/ecams 진행해줘.
```

## 운영 규칙

- 채팅에는 짧은 지시만 남기고, 긴 검토 내용은 bridge 파일에 쓴다.
- 새 요청을 만들 때 이전 내용을 덮어써도 된다. 합의된 결정은 `decisions.md`에 따로 누적한다.
- 구현 전에는 `current.md`와 양쪽 요청 파일을 읽고 충돌 여부를 확인한다.
- 작업이 끝나면 `current.md`의 상태와 다음 액션을 갱신한다.
- 중요한 결정은 반드시 관련 feature의 `context-notes.md`에도 남긴다.
