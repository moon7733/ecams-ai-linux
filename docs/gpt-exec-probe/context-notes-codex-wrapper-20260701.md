# Context Notes - Codex wrapper 후속 검증

## 2026-07-01 Claude 회신 4 후속 검증과 wrapper

`read-only` + cwd=실repo 조건을 배포 후보 config로 검증했다. Codex exec를 `--sandbox read-only --cd C:\ecams-ai --skip-git-repo-check`로 실행했고, repo 최상위 목록, `package.json`, `server.js`, `docs/gpt-exec-probe/context-notes.md` 읽기가 성공했다. 일부 PowerShell context 검색은 정책상 거절됐지만 단순 읽기와 `rg` 검색은 성공했으므로 전체 repo 읽기 자체는 가능하다고 판단했다.

같은 조건에서 repo 내부 쓰기 2건을 시도했다. `C:\ecams-ai\scratch\codex-readonly-repo-probe\model-write-test.txt`와 `C:\ecams-ai\MODEL_WRITE_TEST.txt` 모두 `rejected: blocked by policy`로 차단됐고, 후속 `Test-Path`에서도 두 marker 파일이 없었다. 따라서 질의응답 플로우의 repo 쓰기 0 조건은 참으로 본다.

이 config를 기준으로 `server.js`에 `runCodexExecStream` 최소 wrapper를 추가했다. 바이너리 경로는 `CODEX_EXE` env로 override 가능하게 두고, 기본값은 확인된 AppData 경로를 사용한다. wrapper는 `codex exec --json --sandbox read-only --cd __dirname --skip-git-repo-check --ignore-rules -`로 실행하며, stdin으로 eCAMS system prompt와 조립된 prompt를 전달한다. JSONL에서 `agent_message`를 기존 job stream으로 보내고 `turn.completed.usage`를 elapsed 이벤트에 싣는다. `/api/chat`에서는 `modelInput === 'codex'`일 때만 이 경로를 탄다.

속도 대조 결과. Codex Q1은 `server.js`의 `runAgyStream` 설명 질문으로 63.2초가 걸렸고, 모델이 `server.js` 전체를 읽어 input 109,089 tokens가 발생했다. Codex Q2는 `package.json`과 `server.js` 기반 실행 진입점, `build:cm` 요약 질문으로 18.5초가 걸렸고 input 45,130 tokens가 발생했다. 기존 AGY 로그의 최근 정상 응답은 27.2초, 38.1초, 48.8초, 50.7초, 64.0초, 107.1초, 127.1초 등으로 분산됐으며 timeout 304.8초 사례도 있다. 작은 질문은 Codex가 AGY 최상위권보다 빠를 수 있고, 큰 파일 읽기 질문은 AGY 평균권과 비슷하다. 정확도 품질은 별도 사용자 검증이 필요하다.
