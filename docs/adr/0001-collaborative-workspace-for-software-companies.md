# ADR 0001: Collaborative workspace for software companies, git-backed

- **Status:** Accepted
- **Date:** 2026-09-23
- **Decider:** Jussi Hallila

## Context
Viberglass started as "tickets in, pull requests out". A beta user couldn't tell what the product was for, and argued that the software-only framing was baked in too deep. The UX audit (`docs/ux/user-journeys-and-personas.md`) proposed choosing between a general collaborative AI workspace and a narrower developer tool.

## Decision
Viberglass is a **collaborative workspace where people and AI agents work together on objectives**, aimed at **software companies**. **Git is the backing substrate for now:** every workspace works against repositories, and agent output lands in git (branches, PRs, committed documents).

## Consequences
- The collaboration model (members, roles, participants, questions, reviews, inbox, activity) is the core of the product, not an add-on.
- Work is still repository-backed. Non-code objectives (research, docs, release notes, analysis) are in scope *when their output lives in a repo*. Repo-less spaces and knowledge connectors such as Drive or Notion are out of scope for now.
- Non-engineering roles inside software companies (product, design, QA, support) are first-class participants.
- Research → Plan → Execute → PR stays the flagship workflow. Workflow templates should still be data, so git-backed variants (e.g. Research → Doc PR) don't need special-casing.
