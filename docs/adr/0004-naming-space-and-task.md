# ADR 0004: Name the core entities "Space" and "Task"

- **Status:** Accepted
- **Date:** 2026-09-23
- **Decider:** Jussi Hallila

## Context
The UI currently uses "Project" and "Ticket". The audit proposes decoupling work items from their grouping: work items owned by the workspace, groupings as optional lenses with defaults (repo, members, policies). The old names carry the old hierarchy ("a ticket belongs to a project") and a bug-tracker framing.

## Decision
- The grouping is called a **Space**. A space holds context and defaults: repository, members, agent instructions, default workflow.
- The work item is called a **Task**. A task is owned by the workspace and can link to spaces and to other tasks.

## Consequences
- All user-facing copy, navigation and URLs move from project/ticket to space/task. The rest of the glossary in `docs/ux/user-journeys-and-personas.md` §5.2 applies too (Agent, Run, Automation, Inbox).
- Internal code and DB names can migrate gradually. Only UI copy and public API/URL names need to change up front; old URLs should redirect.
- Tasks that come from external trackers (Jira, Shortcut, GitHub Issues) are still called Tasks in Viberglass and show their external key.
