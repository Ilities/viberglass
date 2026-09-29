# ADR 0006: Agent questions and session continuity

- **Status:** Accepted
- **Date:** 2026-09-29
- **Decider:** Jussi Hallila

## Context
Phase 3 lets agents and people work in the same session. Today nothing emits `needs_input`; the platform guesses a question when the agent's last text ends with "?", every turn is its own worker job with a fresh clone, and execution turns push a new branch per turn while research and planning push nothing (`docs/ux/phase-2-3-handover.md` §3.0). These are decisions D7, D8 and D9 in that handover, plus how a turn that writes no document ends.

## Decision
- **Asking (D7): an `ask_human` MCP tool**, offered to the agent through ACP `mcpServers`. Arguments: question, options, addressee (a role such as requester, owner or reviewer, or a person) and blocking yes/no. Where a harness uses ACP elicitation instead, it's forwarded to the same path. The "ends with ?" guess is removed once the tool works.
- **Waiting (D8): end the job and resume.** A blocking question ends the turn's job; the answer starts a new turn that restores the conversation with `session/load`. No worker is held while a person thinks.
- **Where the work lives (D9): one session branch per live session**, pushed after every turn. Take over is a checkout of that branch (with a `viberglass checkout <task>` helper); hand back resumes from the pushed head.
- **A follow-up turn that ends without writing the document leaves the session waiting on the person**, not failed: the agent answered, and the person can reply or approve.

## Consequences
- `agent_pending_requests` gains addressee, blocking, options and due dates, and allows several open requests per session and requests from one-shot runs.
- Questions route through Phase 2's participants and notifications, so Phase 3's question work depends on the Inbox.
- The fake agent gains `[fake:ask=…]` so journeys can test questions without a model.
- Every turn commits and pushes to the session branch, including research and planning; `workspace_branch` and `head_commit_hash` on `agent_sessions` start being written.
- Interrupting a running turn cancels its job and starts the next turn at once; partial work survives on the session branch.
