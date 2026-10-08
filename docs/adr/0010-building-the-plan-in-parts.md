# ADR 0010: Building the plan in parts

- **Status:** Accepted; amended by [ADR 0013](./0013-ways-around-building-in-parts.md)
- **Date:** 2026-10-06
- **Decider:** Jussi Hallila
- **Amends:** [ADR 0007](./0007-iterating-on-a-task.md) (one pull request per task), [ADR 0008](./0008-tasks-are-conversations.md) (done is a merged pull request), [ADR 0009](./0009-the-plan-includes-the-research.md) (building part at a time)

## Context
A task has one branch and one pull request, and every build adds commits to it. A large plan therefore ends as one large pull request, which is hard to review. Working locally, people build a plan a part at a time and review each part on its own, and they want the same in Viberglass.

Whatever records which parts are done has to be deterministic. Viberglass can't tell from the code which steps of a plan an agent really finished, and an agent ticking boxes in the plan is only its own claim. What Viberglass does know for certain is which pull requests a build opened and whether they're merged: it already polls every pull request's state.

## Decision
- **A plan is written in parts.** Each part is sized for one review and is a `## Part N: <title>` section of the plan. The steps inside a part are the agent's business. A small plan has one part. A plan without part headings is one part.
- **A build covers one or more consecutive parts that aren't built yet, and opens one pull request.** *Build it* builds every remaining part in one pull request; *Build part N* builds that part alone. Further builds of a part, such as asked-for changes, add to its pull request.
- **A part's state comes from its pull request, never from the plan's text.** A part is built once its pull request exists and done once that pull request is merged.
- **Parts are built in order, one at a time.** A later part can be built once every earlier part's pull request is merged, so every part's branch starts from the base branch, and a task has at most one open pull request. Stacked pull requests (a part built on an unmerged earlier one) may come later; they'd have to work for repositories that squash-merge as well as ones that merge with merge commits.
- **A part keeps its number and scope once built.** Revising the plan leaves built parts as they are and changes or adds the parts that aren't built yet.
- **A task is done when the pull requests of all its parts are merged.** People can still finish it earlier by hand.

## Consequences
- A task has a list of pull requests, each with its branch, the parts it covers and its state, instead of one pull request URL and one branch.
- Merge detection, the Code tab, the task's situation ("PR for part 1 of 3 open", "Your move · build part 2") and the build prompt's "this continues the pull request" work per pull request.
- The plan prompt asks for parts, and its revise instructions keep built parts fixed. The build prompt says which parts to build and to leave the rest.
- The suggested actions offer *Build it*, *Build part N* and *Build the rest*, only when the earlier parts are merged. Slack's next-step button follows the same rule.
- **ADR 0007:** a build after the first continues the pull request of the part it builds. A new part gets a new branch and pull request.
- **ADR 0008:** done is every part's pull request merged.
