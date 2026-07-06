# AGENTS.md

이 파일은 **이 레포에서 작업하는 모든 AI 코딩 도구**가 세션 시작 시 자동으로 읽도록 설계된 공통 행동 가이드라인이다.

대상 도구.
- **Claude Code** — `.claude/CLAUDE.md` 에서 `@AGENTS.md` 로 import
- **Antigravity 2.0** — `AGENTS.md` 를 직접 자동 로드

도구별 추가 규칙은 각 도구의 전용 파일에 둔다. 공통 본문은 여기 한 곳에서만 관리한다.

---

## 0. 세션 시작 시 우선 확인

작업 시작 전에 아래를 먼저 읽는다.

1. **`MEMO.md`** — `gen_memo.js` 가 자동 생성한 현재 프로젝트 상태 (최근 변경 파일, 현재 골). 휘발성.
2. **`docs/` 하위 진행 중 feature 문서** — 특히 `docs/<feature>/checklist.md` 가 있으면 어디까지 진행됐는지 확인.
3. **누적 결정 기록 (결정 1~68, 2026-05-19 ~ 2026-05-21)** — 이전 PoC 두 개의 plan/checklist/context-notes 에 모든 결정 본문 보존.
   - **`wiki-poc/`** — 카파시 LLM wiki PoC. **결정 1~61** (Phase 1~14). 환각 패턴 7개, system.md 13개 규칙 도출. 본격 통합에서 막다른 길 검증 → repo-map PoC 로 전환.
   - **`repo-map-poc/`** — Aider 패턴 + Sonnet/Haiku repo-map RAG. **결정 62~68** (Day 1~6). 운영 권고 확정 (Haiku 81%/44s 기본 + Sonnet 14 정밀 옵션, Sonnet+Haiku 제외).
   - 관련 feature 작업 시 이 두 폴더의 `context-notes.md` 먼저 검색해서 결정 근거 확인.

### eCAMS 짧은 명령 규칙

사용자가 아래 짧은 명령을 쓰면 다음 의미로 처리한다.

- `ecams 진행해줘` 또는 `/ecams 진행해줘` — `docs/agent-bridge/current.md`의 다음 액션을 계속 진행한다. 이미 합의된 범위 안에서는 추가 승인 요청 없이 구현, 검증, 커밋까지 진행한다. 불확실하거나 합의 밖이거나 위험한 변경이면 그때만 사용자에게 묻는다.
- `ecams 새작업: ...` 또는 `/ecams 새작업: ...` — 새 문제나 새 수정사항으로 시작한다. 먼저 기존 `current.md`와 충돌하는지 확인하고, 작으면 바로 진행하며, 크면 `docs/<feature>/plan.md`, `checklist.md`, `context-notes.md`를 만든 뒤 진행한다.
- `ecams 합의해줘` 또는 `/ecams 합의 진행해줘` — `docs/agent-bridge/to-codex.md`와 관련 bridge 문서를 읽고 합의 가능한 부분, 충돌하는 부분, 다음 액션을 정리한다. 합의된 결정은 `docs/agent-bridge/decisions.md`와 관련 feature의 `context-notes.md`에 남긴다.

bridge 파일을 만들거나 갱신한 뒤에는 사용자에게 다음에 어느 도구에 어떤 한 줄을 보내면 되는지 반드시 알려준다.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. No Closing Colons (Korean Output)

**End Korean sentences with a period, not a colon.**

When the user writes in Korean, your output is also Korean:
- Don't end sentences with `:` even if the next line is a list or example.
- LLMs trained on English docs leak the colon habit into Korean. Catch it.
- The test: every Korean sentence terminator should be `.`, `?`, or `!` — not `:`.
- Colons are fine inside code, key-value pairs, or labels. Not as sentence enders.

## 6. File Header Comments in Korean

**First line of every new source file: a one-line Korean comment stating its role.**

When creating a new file:
- TypeScript/JavaScript: `// 사용자 인증 상태를 관리하는 Context Provider`
- Python: `# KIS API 호출을 비동기로 래핑하는 클라이언트`
- SQL: `-- 일별 집계 결과를 저장하는 머티리얼라이즈드 뷰`
- Place it directly under required directives (`'use client'`, `'use server'`, shebang).
- Skip config files (`*.config.ts`, `package.json`, etc.).

Why: agents read files selectively, not whole codebases. A one-line Korean header gives instant context so the next session (human or agent) can navigate without re-reading the entire file.

## 7. Plan + Checklist + Context Notes

**Before any non-trivial task, produce three artifacts. Don't start coding without them.**

- **Plan** — what we're building and why.
- **Checklist** (`checklist.md`) — concrete tasks as checkboxes. Tick as you go.
- **Context Notes** (`context-notes.md`) — decisions made during the work and the reasoning behind them. Append continuously.

세 파일은 `docs/<feature-name>/` 하위에 둔다. 예. `docs/agy-integration/{plan,checklist,context-notes}.md`.

If the user gives only a plan and asks you to start coding, stop and ask: "Should I create the checklist and context notes first?" The next session — yours or someone else's — needs the notes to pick up where you left off without re-deriving every decision.

## 8. Run Tests Before Marking Complete

**If you touched code, run the tests before saying "done".**

- `npm test`, `pytest`, `cargo test`, whatever the project uses — run it.
- If tests pass, report results. If they fail, fix and re-run.
- No test setup? At minimum, verify the project builds/compiles.
- Run tests proactively, before the user signals "끝", "완료", "다 됐어" — not after.

This is the step LLMs skip most often. Treat it as non-negotiable.

## 9. Semantic Commits

**Commit when one logical change is complete. Don't wait for the user to ask.**

- The test: "Can I describe this commit in one sentence?" If yes, commit. If no, the changes are still mixed — split them.
- Good: "auth 미들웨어 추가". Bad: "auth 추가하고 UI도 고치고 버그도 수정" (split into 3).
- Don't accumulate 20 unrelated edits and lose the ability to roll back individually.
- Don't commit just to commit — meaningful units only.

Note: For solo prototypes or throwaway scripts, group commits loosely if it slows you down. The point is reversibility, not ceremony.

## 10. Read Errors, Don't Guess

**Read the actual error/log line. Don't pattern-match from memory.**

When something fails:
- Read the full error message and stack trace.
- Check the actual log output, not what you assume it should say.
- Don't apply a "common fix" before confirming the cause.
- If unclear, add a print/log to verify state — then fix.

This is the step LLMs skip most often after "run tests". They guess from error keywords and apply the most-recent-pattern fix. That's how a one-line bug becomes a three-file refactor.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
