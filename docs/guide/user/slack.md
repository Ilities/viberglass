# Slack

With the Slack app connected, people can start a task from Slack and follow it in a Slack thread that stays in step with the task in Viberglass. This page covers using it; your admin sets up the app (see [Repositories and integrations](../admin/repositories-and-integrations.md#slack)).

## Link your account first

In Viberglass, open Settings → Notifications and choose Link Slack. Viberglass finds your Slack account by your email address.

A linked account lets you take part in task threads as yourself, see only the spaces you have access to, and ask the agent to build. Someone who hasn't linked can still start a task with a plan, but their replies in a task's thread aren't taken; they get a reply asking them to link their account.

## Start a task

1. Invite the bot to the channel: `/invite @Viberator`.
2. Type `/viberator`.
3. In the Ask the agent form, choose the space and the agent, and whether to start with a plan or with the build. Write what you want done; the title is optional.
4. Choose Ask.

The bot posts the task in the channel, with a link to it in Viberglass, and asks the agent. The thread under that post is the task's Slack thread from then on.

## Work in the thread

- A plain reply becomes a message on the task, posted as you.
- A reply that mentions the bot asks the agent, with your message as the request.
- When the agent has asked you a question, your reply answers it. If the question offered options, they appear as buttons.
- Mentioning another person makes it a mention in Viberglass, if they've linked their Slack account.
- After a plan, the Build it button asks the agent to build it.

## What the bot posts

The thread follows the task, whatever caused the change: the web, Slack or a schedule.

- Messages people write on the task in Viberglass.
- When a run starts, such as "The agent is writing the plan…".
- The agent's reply when a run finishes, shortened with a link if it's long.
- The plan, attached as `plan.md`, with a Build it button.
- The pull request's link after a build.
- The agent's questions, with option buttons.
- Answers given on the web.
- Failed and cancelled runs.
- "Done." when the pull request is merged or the task is finished.

Only tasks started with `/viberator` have a Slack thread. For other tasks, Slack sends DMs to people who linked their account; see [Home and notifications](home-and-notifications.md).
