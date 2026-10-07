# ADR 0011: Tracker issues are linked threads

- **Status:** Accepted
- **Date:** 2026-10-07
- **Decider:** Jussi Hallila
- **Amends:** [ADR 0008](./0008-tasks-are-conversations.md) (where the conversation happens)

## Context
Jira, Shortcut and GitHub issues reach Viberglass through inbound webhooks. They still follow the model from before tasks were conversations: a new issue creates a task and can start a build straight away, and a comment that mentions the bot with "fix this" creates another task and builds it. Edits to an issue are ignored, and nothing goes back to the issue, so people who live in the tracker can't follow the work or take part in it.

A task's Slack thread already works the way a tracker issue should: what people write there reaches the task's thread, a message that mentions the bot asks the agent, and the task's changes are posted back.

## Decision
- **An issue from a connected tracker is linked to the task it created,** as a Slack thread is. One task per issue.
- **A new issue creates its task.** Each connection chooses whether that's all, or whether the agent also writes the plan. Nothing builds before there's a plan.
- **An edit to the issue updates the task's title and description.**
- **A comment on the issue is a message in the task's thread.** It's posted as the matching Viberglass person when the commenter can be matched (by email, or a linked account), and otherwise named as who wrote it and where ("Pat on Jira"). A comment that mentions the bot asks the agent, whoever wrote it: anyone who can comment on the issue can already create issues that start work. A reply from the person the agent asked answers its question.
- **Viberglass posts milestones back to the issue:** the plan is ready (a short summary and a link), the agent's questions, the pull request, and done. The agent's reply is posted too when the ask came from the issue. Messages written in Viberglass stay there.
- **Comments Viberglass posts are never read back as new messages.**

## Consequences
- A task can be linked to one tracker issue. The link records the connection it came through, whose credentials post the comments.
- A message in the thread has either a Viberglass author or an outside one with a name and a source.
- A connection's "build new issues" setting becomes "write the plan for new issues". The keyword triggers ("fix this", "autofix") go.
- Each tracker supplies the same three things: reading its webhook payloads into issue opened, edited and commented, posting a comment, and recognising its own comments.
- Jira and Shortcut stop being marked as stubs once they've been tried against a real site.
