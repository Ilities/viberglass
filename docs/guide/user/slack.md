# Slack

With the Slack app connected, people can start a task from Slack and follow it in a Slack thread that stays in step with the task in Viberglass. This page covers using it; your admin sets up the app (see [Repositories and integrations](../admin/repositories-and-integrations.md#slack)).

## Link your account first

In Viberglass, open Settings → Notifications and choose Link Slack. Viberglass finds your Slack account by your email address.

A linked account lets you start tasks from Slack, take part in task threads as yourself, see only the spaces you have access to, and ask the agent to build. Without one, `/viberglass` doesn't open the form and your replies in a task's thread aren't taken; instead you get a message asking you to link your account.

## Start a task

1. Invite the bot to the channel: `/invite @Viberglass`.
2. Type `/viberglass`.
3. In the Ask the agent form, choose the space and the agent, and whether to start with a plan or with the work itself. Write what you want done; the title is optional.
4. Choose Ask.

The bot posts the task in the channel, with a link to it in Viberglass, and asks the agent. The thread under that post is the task's Slack thread from then on.

The work itself is the build in a Git space and the artifact in a Files space (see [Files and artifacts](files-and-artifacts.md)). Slack can't change the form's choices when you pick another space, so when you can see both kinds of space, the choice reads "The build, or the artifact in a Files space" and Files spaces are marked "(Files)" in the space list.

## Work in the thread

- A plain reply becomes a message on the task, posted as you.
- A reply that mentions the bot asks the agent, with your message as the request.
- When the agent has asked you a question, your reply answers it. If the question offered options, they appear as buttons.
- Mentioning another person makes it a mention in Viberglass, if they've linked their Slack account.
- After a plan, buttons ask the agent to build it: Build it, or for a plan in parts, Build part 1 or the whole plan in one pull request.
- In a Files space, the button after a plan is Create artifact, and after the agent makes an artifact it's Revise artifact. Mark done sits beside it and finishes the task, as Actions → Mark done does in Viberglass. It needs the same rights: the task's requester or owner, the space's maintainers, or an admin.

## What the bot posts

The thread follows the task, whatever caused the change: the web, Slack or a schedule.

- Messages people write on the task in Viberglass.
- When a run starts, such as "The agent is writing the plan…" or, in a Files space, "The agent is working on the artifact…".
- The agent's reply when a run finishes, shortened with a link if it's long.
- The plan, attached as `plan.md`, with a button for the build.
- The pull request's link after a build.
- In a Files space, what the turn saved, such as "Saved files · 2 added, 1 changed · 14 files", and a link to each artifact version it made.
- When a part of a plan in parts is merged, with a button for the next part.
- The agent's questions, with option buttons.
- Answers given on the web.
- Failed and cancelled runs.
- "Done." when the pull request is merged or the task is finished or marked done.

Only tasks started with `/viberglass` have a Slack thread. For other tasks, Slack sends DMs to people who linked their account; see [Home and notifications](home-and-notifications.md).
