# ADR 0012: Spaces choose which tracker issues they take

- **Status:** Accepted; amended by [ADR 0014](./0014-spaces-opt-in-to-tracker-issues.md)
- **Date:** 2026-10-08
- **Decider:** Jussi Hallila
- **Amends:** [ADR 0011](./0011-tracker-issues-are-linked-threads.md) (which space a new issue's task goes to, and one task per issue)

## Context
A connection to Jira, Shortcut or GitHub lives in the workspace settings. Under it, each inbound webhook mapped one tracker scope (a repository, a Jira project key, a Shortcut project) to one space, matched on the exact key. Setting it up meant an admin knowing the tracker's internal identifiers, and deciding which issues a space takes happened away from the space.

One key to one space fits GitHub, where an issue lives in a repository. It doesn't fit how Jira and Shortcut are used: one Jira project often feeds several teams, and Jira and Shortcut send a whole site's or workspace's events through one webhook.

A space has one repository. Work that spans several repositories spans several spaces.

## Decision
- A connection has one webhook for its tracker, set up by an admin in the workspace settings: its address and secret, the events, the bot account, and the delivery history. Every delivery is recorded, including the ones no space takes, with the reason.
- Each space says which issues it takes, in its own settings. Whether the agent writes the plan for new issues is set there too.
- For Jira and Shortcut a space takes issues by label: an issue with one of the space's labels, anywhere in the connected site or workspace, goes to the space. Jira projects and Shortcut teams don't take part.
- A GitHub issue goes to the space whose repository it's in, without any setup. The space can narrow that to issues with certain labels.
- When an issue matches more than one space, each of them gets its own task, linked to the same issue. Comments on the issue reach every linked task, a mention of the bot asks the agent in each, and a reply answers whichever task asked that person. Milestones posted back to the issue name the space when it has more than one task.
- An issue no space takes is ignored. A later edit is routed again, so adding the label afterwards brings it in.
- A task can be copied to another space, for work that turns out to need another repository. The copy is a new task with the same title and description; both threads mention the other. The tracker issue stays linked to the original.
- Labels and repository names match without regard to case.

## Consequences
- The connection screen keeps the webhook settings and deliveries, and lists the spaces that take issues from it. A space's "Incoming issues" settings hold its labels and plan setting.
- A tracker issue can be linked to several tasks, one per space. A task is still linked to at most one issue.
- Once a task exists it stays linked to its issue. Removing the label or changing the space's labels later doesn't remove or move it.
