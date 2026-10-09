# Architecture & Product Decision Records

Decisions are owned by Jussi Hallila. Each ADR records one decision: its context, the decision itself, and its consequences. Superseded ADRs stay in place and are marked as superseded.

ADRs record the product and architecture decisions, and why they were made.

| # | Title | Status | Date |
|---|---|---|---|
| [0001](./0001-collaborative-workspace-for-software-companies.md) | Collaborative workspace for software companies, git-backed | Accepted; workflow amended by 0009 | 2026-09-23 |
| [0002](./0002-self-hosted-portfolio-first.md) | Self-hosted, portfolio-first distribution | Accepted | 2026-09-23 |
| [0003](./0003-product-leader-as-primary-persona.md) | Product leader as primary persona, including setup | Accepted; persona amended by 0008 | 2026-09-23 |
| [0004](./0004-naming-space-and-task.md) | Name the core entities "Space" and "Task" | Accepted | 2026-09-23 |
| [0005](./0005-roles-and-space-visibility.md) | Workspace roles, space roles and space visibility | Accepted | 2026-09-29 |
| [0006](./0006-agent-questions-and-session-continuity.md) | Agent questions and session continuity | Accepted; amended by 0008 | 2026-09-29 |
| [0007](./0007-iterating-on-a-task.md) | Iterating on a task: follow-up builds, change requests, reopening | Accepted; amended by 0008, 0009, 0010 | 2026-09-30 |
| [0008](./0008-tasks-are-conversations.md) | Tasks are conversations: one thread, @mention or action to bring the agent in, agreement instead of approval gates | Accepted; amended by 0009, 0010, 0011 | 2026-10-01 |
| [0009](./0009-the-plan-includes-the-research.md) | The plan includes the research: one artifact before code | Accepted; amended by 0010 | 2026-10-06 |
| [0010](./0010-building-the-plan-in-parts.md) | Building the plan in parts: one pull request per part, built in order | Accepted; amended by 0013 | 2026-10-06 |
| [0011](./0011-tracker-issues-are-linked-threads.md) | Tracker issues are linked threads: comments reach the task, milestones go back to the issue | Accepted; amended by 0012 | 2026-10-07 |
| [0012](./0012-spaces-choose-their-tracker-issues.md) | Spaces choose which tracker issues they take: labels and repository in the space, one webhook per connection | Accepted; amended by 0014 | 2026-10-08 |
| [0013](./0013-ways-around-building-in-parts.md) | Ways around building in parts: mark a part done or skipped, discard a build without a pull request, add a part to the open pull request | Accepted | 2026-10-08 |
| [0014](./0014-spaces-opt-in-to-tracker-issues.md) | Spaces opt in to every tracker's issues: no rules takes none, the same choices for every tracker | Accepted | 2026-10-08 |
| [0015](./0015-harnesses-and-integrations-are-plugins.md) | Harnesses and integrations are plugins, chosen by build config: manifests, capabilities, sign-in as a capability | Accepted | 2026-10-09 |
