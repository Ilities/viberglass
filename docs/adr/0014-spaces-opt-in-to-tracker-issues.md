# ADR 0014: Spaces opt in to every tracker's issues

- **Status:** Accepted
- **Date:** 2026-10-08
- **Decider:** Jussi Hallila
- **Amends:** [ADR 0012](./0012-spaces-choose-their-tracker-issues.md) (a GitHub issue going to the space whose repository it's in without setup)

## Context
ADR 0012 had two ways of taking issues. A Jira or Shortcut issue went only to the spaces that chose it by label. A GitHub issue went to every space using its repository, with no setup, and a space could only narrow that down to labels.

Several spaces can use the same repository. Each then got a task for every issue, and there was no way to turn that off for a space, short of a label nobody uses. The two models also meant tracker-specific branches in the rules, the router and the settings card.

## Decision
- A space takes a connection's issues only through its own rules, for every tracker. No rules, and it takes none.
- A rule takes every issue, or the issues with its label. Whether the agent writes the plan for new issues is part of the rule.
- An issue that belongs to a repository goes only to the spaces using that repository. Which trackers' issues belong to a repository is described by the tracker's package; the router goes by whether the issue has a repository, not by which tracker sent it.
- A space's Incoming issues offers the same three choices for every tracker: none, every issue, or only those with certain labels.

## Consequences
- A space using a GitHub repository no longer takes its issues until someone chooses to. Sharing a repository between spaces doesn't share its issues.
- A Jira or Shortcut space can take every issue from the connection, not only labelled ones.
- The connection screen lists the spaces taking its issues, with what each takes.
