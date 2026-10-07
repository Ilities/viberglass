# ADR 0007: Iterating on a task

- **Status:** Accepted
- **Date:** 2026-09-30
- **Decider:** Jussi Hallila
- **Amended by:** [ADR 0008](./0008-tasks-are-conversations.md) (tasks are conversations), 2026-10-01; [ADR 0009](./0009-the-plan-includes-the-research.md) (no separate research), 2026-10-06; [ADR 0010](./0010-building-the-plan-in-parts.md) (a pull request per part), 2026-10-06

## Context
A task ran research, plan and build once each. Once research or the plan was approved nothing reopened it, and a second build failed: it started a fresh branch from the base branch and pushed, without force, to the task's branch `viberglass/<task>`, which the first build had already pushed. When the plan's approval was withdrawn the task stayed in the build step, so the next build was refused. The UX contract (`docs/SUBMITTER_UX_CONTRACT.md`) describes a linear journey, and nothing described iterating on it.

## Decision
- **A build after the first continues the task's branch.** The worker checks out `viberglass/<task>` when origin has it, and the agent works on top of the earlier builds. Its commit fast-forwards the branch, so the same pull request gains a commit per build. With a branch template that names a branch per run, each run still gets its own branch and pull request.
- **Ask for changes on a build**, as on research and the plan. The reviewer writes a note and can send the pull request's open review comments too: unresolved, current inline threads, and review summaries and conversation comments written since the last build. They're read with GitHub GraphQL, because the REST API doesn't say whether a thread is resolved. "Run the build again" is the same run without a note.
- **Research and the plan can be reopened.** Reopening moves the task back to that step and puts that step's document and every later one up for approval again, keeping their content. An open pull request stays open, and the next build adds to it. Approving reopened research, when a plan already exists, takes the task to that plan for review instead of writing a new one.

## Consequences
- The build prompt gains a change-request block when a pull request exists. The reviewer's note and the pull request's comments are untrusted text, so they're escaped and framed as requests about the code, not instructions.
- A past step's document is edited only after it's reopened, so an edit can't silently un-approve a plan a build depends on. "Withdraw approval" is replaced by reopening the plan.
- The pull request's title and description are written by its first build and aren't rewritten by later ones.
- The build step shows the pull request as GitHub has it, with its state, branches, changes, commits and open review comments, for everyone on the task.
