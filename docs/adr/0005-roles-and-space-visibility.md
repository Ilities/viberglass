# ADR 0005: Workspace roles, space roles and space visibility

- **Status:** Accepted
- **Date:** 2026-09-29
- **Decider:** Jussi Hallila

## Context
Phase 2 adds people: invites, space membership, participants and approvals. Today `users.role` is admin or member, any member can approve, and space membership (`user_projects`) exists but is stale and enforced nowhere. The role and visibility model has to be settled before invites and membership are built.

## Decision
- **Workspace roles: Admin, Member, Guest, Viewer.**
  - **Admin:** everything, including Settings → Advanced (runners, connections, secrets, prompt templates) and member management.
  - **Member:** sees open spaces, creates spaces and tasks, runs agents, comments and approves where the approval policy allows. No plumbing.
  - **Guest:** invited to specific spaces only. Can comment, answer agent questions and approve when they're a task's reviewer. Sees no plumbing and can't create spaces.
  - **Viewer:** read-only across the workspace. Sees every open space and task like a member, but can't create, comment, approve or run anything.
- **Space roles: Maintainer and Member.** Maintainers own the space's defaults, approval policy, prompt templates and members. Workspace admins are maintainers of every space. "Reviewer" is not a role: it's set per task by the approval policy.
- **Visibility: open by default, with an optional Private flag.** Every member and viewer sees every open space; membership sets defaults and notifications. A private space is visible only to its members (and admins). Guests see only the spaces they're invited to, open or not.
- **Guests and viewers are invitable in Phase 2**, through the same invite flow as members. People who report work without an account (from Slack or a form) wait for Phase 4 with J15.

## Consequences
- `UserRole` gains `guest` and `viewer`. Every `requireRole` / `requirePolicy` decision has to cover them; the default for a new policy is deny for both.
- Viewers are read-only on the server, not only in the UI: every mutating route refuses them (403).
- Space list and task queries filter by visibility for every role, and API and MCP tokens get the same filtering as their user.
- Project-level prompt templates (PG17) become maintainer-only.
- Worker callback routes (`/api/jobs/:id/...`) authenticate with callback tokens and stay outside these checks.
