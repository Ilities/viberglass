# Slack Integration

Viberglass connects to Slack through the [Vercel Chat SDK](https://github.com/vercel/chat). People can start a task from Slack with `/viberglass`, and the task then gets a Slack thread that mirrors its thread in Viberglass. What people write in the Slack thread goes to the task, and what happens on the task (messages from the web, the agent's runs, its questions, the plan, the pull request) is posted back into the thread.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Creating the Slack App](#creating-the-slack-app)
- [Configuration](#configuration)
- [Linking Slack Accounts](#linking-slack-accounts)
- [Usage](#usage)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Updating the App](#updating-the-app)

## Overview

The integration provides:

- A `/viberglass` slash command that opens a form to create a task and ask an agent for a plan or for code.
- One Slack thread per task started from Slack, kept in step with the task's thread in Viberglass.
- Thread replies that become messages on the task, asks of the agent (when they mention the bot) or answers to the agent's question.
- Buttons in the thread: a **Build it** button after a plan, and option buttons on the agent's questions.
- Slack DMs for people who linked their Slack account (review requests, mentions, assignments, failed runs, questions, expiring credentials). Step and task updates go to the task's thread instead of a DM.

A task works in two steps: the agent writes a plan, then it writes the code. You can start at either step.

## Prerequisites

- A Slack workspace where you can install apps.
- The platform backend reachable over HTTPS (use ngrok for local development).
- At least one space (project) and one agent (clanker) configured in Viberglass.

## Creating the Slack App

### Option A: From Manifest (Recommended)

1. Go to [api.slack.com/apps](https://api.slack.com/apps).
2. Click **Create New App** > **From a manifest**.
3. Select your workspace.
4. Paste the contents of `apps/platform-backend/slack-app-manifest.json`.
5. Replace every `YOUR_HOST` with your backend host.
6. Click **Create**, then install the app to your workspace.

### Option B: Via Slack API

```bash
curl -X POST https://slack.com/api/apps.manifest.create \
  -H "Authorization: Bearer xoxe-..." \
  -H "Content-Type: application/json" \
  -d @apps/platform-backend/slack-app-manifest.json
```

### Option C: Manual Setup

1. Create a new app at [api.slack.com/apps](https://api.slack.com/apps) > **From scratch**.
2. **Bot User**: set the display name to "Viberglass" and enable "Always Online".
3. **OAuth Scopes** (Bot Token): `commands`, `app_mentions:read`, `chat:write`, `chat:write.public`, `channels:read`, `channels:history`, `groups:read`, `groups:history`, `im:read`, `im:history`, `im:write`, `users:read`, `users:read.email`, `files:write`. `users:read.email` is used to link accounts by email, `im:write` to send DMs, and `files:write` to attach `plan.md`.
4. **Slash Commands**: create `/viberglass` pointing to `https://{host}/api/webhooks/slack`.
5. **Interactivity**: enable it and set the Request URL to `https://{host}/api/webhooks/slack`.
6. **Event Subscriptions**: enable them, set the Request URL to `https://{host}/api/webhooks/slack`, and subscribe to `app_mention`, `message.channels` and `message.groups`.
7. Install to the workspace.

All three Slack features (slash command, interactivity, events) use the same URL.

### Collect Credentials

1. **OAuth & Permissions** > copy the **Bot User OAuth Token** (`xoxb-...`).
2. **Basic Information** > copy the **Signing Secret**.

## Configuration

Set these on the platform backend:

```bash
# Bot User OAuth Token (OAuth & Permissions page)
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Signing Secret (Basic Information page)
SLACK_SIGNING_SECRET=your-signing-secret

# Used to build task links posted in Slack, e.g. https://viberglass.example.com
PLATFORM_FRONTEND_URL=https://your-frontend-host
```

- The Slack adapter is only created when `SLACK_SIGNING_SECRET` is set and not `not-configured`. Without it, `/api/webhooks/slack` answers `503`.
- `SLACK_BOT_TOKEN` is used by the Chat SDK adapter and by the backend's own Slack calls (account linking and DMs). Slack shows as connected in Viberglass only when both values are set.
- Without `PLATFORM_FRONTEND_URL`, Slack posts show the task title without a link.
- The Chat SDK keeps its thread subscriptions in the platform's PostgreSQL database, using the same connection as the rest of the backend.
- On AWS, both Slack values are read from SSM parameters by the backend ECS task (`infra/platform/components/backend-ecs.ts`).

## Linking Slack Accounts

Each person links their Slack account in Viberglass under **Settings → Notifications**. Viberglass looks up the Slack user with the same email address as their Viberglass account and stores the Slack user ID.

What a linked account allows:

- Messages, mentions, answers and option buttons in a task's thread are done as that Viberglass user. Someone without a linked account gets this reply instead: "Link your Slack account in Viberglass (Settings → Notifications) to take part in tasks from Slack."
- The `/viberglass` form lists only the spaces the linked user can see, and the new task's requester is that user. For someone not linked, the form lists every space and the task has no requester.
- Asking the agent for code needs a linked account, so the run can be credited to someone. Someone not linked can still start a task with a plan.
- The usual task permissions apply: only the task's people can ask the agent, and only the task's people, the space's maintainers or a workspace admin can ask it to build.

## Usage

### Starting a Task

1. Invite the bot to a channel: `/invite @Viberglass`.
2. Type `/viberglass` in the channel.
3. Fill in the **Ask the agent** form:
   - **Space**: the space the task belongs to.
   - **Agent**: the agent to ask.
   - **Start with**: **A plan** (the agent writes a plan) or **The build** (the agent writes the code).
   - **Title**: optional. Defaults to the first line of the message.
   - **Message**: what you want done. This becomes the task's description.
4. Click **Ask**.

The bot creates the task, posts `Task: <title>` in the channel (linked to the task), quotes your message in that post's thread, and asks the agent for the plan or the code. That thread is the task's Slack thread from then on.

### Working in the Thread

- **A plain reply** becomes a message on the task, posted as you.
- **A reply that @mentions the bot** asks the agent, with your message (minus the mention) as the ask.
- **A reply from the person the agent asked** answers its open question, unless it mentions the bot.
- **@mentions of other people** become mentions in Viberglass if they have linked accounts. Mentions of people without linked accounts are dropped.
- **Build it** (after a plan) asks the agent to write the code.
- **Option buttons** on a question answer it with that option. Up to five options are shown as buttons. You can always answer by replying in the thread.

### What the Bot Posts

| Event on the task | Post in the thread |
|---|---|
| Someone writes on the task from the web | `**Name:** message` (messages written in Slack aren't posted again) |
| A run starts | _The agent is writing the plan…_ / _The agent is building…_ / _The agent is replying…_ |
| A run finishes | The agent's reply, cut at about 3,000 characters with a link to read the rest in Viberglass |
| The run produced a plan | `plan.md` attached, then "Reply here to discuss it, mention me to ask for changes, or:" with a **Build it** button |
| The run produced code | `Pull request: <url>` |
| The agent asks a question | A card "*Agent* asks *Person*" with the question, option buttons and a note to reply in the thread |
| Someone answers from the web | _Name answered Agent: answer_ |
| A run fails | **The plan run failed**: reason (or **The build run failed**) |
| A run is cancelled | _The run was cancelled._ |
| The pull request is merged or the task is done | **Done.** |

Changes are posted whatever caused them, the web, Slack or a schedule, so the thread matches the task. Only tasks started with `/viberglass` have a Slack thread.

## Architecture

```
Slack workspace
  │
  POST /api/webhooks/slack   (slash command, interactivity and events)
  │
  Chat SDK Slack adapter (verifies the signing secret)
  │
  ├── /viberglass ────────────► slashCommand → "Ask the agent" form (callback viberglass_launch)
  │
  ├── form submitted ─────────► modalSubmit
  │                               ├── createTicket (requester = linked user)
  │                               ├── posts "Task: …" and links that thread to the task
  │                               └── askAgent (plan or code)
  │
  ├── message in task thread ─► threadMessage → TaskThreadInbound.receive
  │                               ├── reply from the person asked → answers the question
  │                               ├── mentions the bot          → asks the agent
  │                               └── otherwise                 → message on the task
  │
  └── button click ───────────► buttonActions
                                  ├── task_ask (Build it)       → TaskThreadInbound.ask
                                  └── question_answer_N         → TaskThreadInbound.answer

Task activity (from anywhere)
  │
  TaskChatMirror (activity listener) → taskMirrorPosts → thread.post(...)
```

Everything a Slack user does is run as their linked Viberglass user, with the Slack user ID recorded on the action (it shows up in the audit log). The mirror uses that to skip posting messages and answers that came from Slack.

A task has at most one Slack thread, stored in `chat_ticket_threads` (task, thread, channel, adapter). Thread lookups are cached in memory and survive restarts through the database. If the bot loses a thread subscription after a restart, the next @mention in that thread subscribes it again.

### Key Files

| File | Purpose |
|------|---------|
| `packages/integrations/integration-slack/src/backend/SlackChatProvider.ts` | Slack's chat capability: the adapter, its handlers, DMs, finding an account by email, Slack's mention syntax |
| `packages/integrations/integration-slack/src/backend/SlackWebApi.ts` | The Slack Web API calls DMs and account linking use |
| `packages/integrations/integration-slack/src/backend/chat/slashCommand.ts` | `/viberglass` opens the launch form |
| `packages/integrations/integration-slack/src/backend/chat/modalSubmit.ts` | Creates the task, starts and links its thread, asks the agent |
| `packages/integrations/integration-slack/src/backend/chat/threadMessage.ts` | Sends messages in a task's thread to the task |
| `packages/integrations/integration-slack/src/backend/chat/buttonActions.ts` | Build it and option buttons |
| `packages/integration-core/src/backend/chat/` | `ChatProvider` and `ChatHandlerServices`, and the button IDs (`task_ask`, `question_answer_0`–`4`) and values |
| `apps/platform-backend/src/chat/bot.ts` | Chat SDK instance with an adapter for each chat service that is set up, and PostgreSQL state |
| `apps/platform-backend/src/chat/index.ts` | Wires each chat service's handlers to backend services and registers the mirror |
| `apps/platform-backend/src/chat/TaskThreadInbound.ts` | Does thread messages, asks and answers as the linked user |
| `apps/platform-backend/src/chat/TaskChatMirror.ts` | Turns task activity into posts in the task's thread |
| `apps/platform-backend/src/chat/taskMirrorPosts.ts` | The posts and cards themselves |
| `apps/platform-backend/src/chat/ticketThreadMap.ts` | Task ↔ thread mapping, with an in-memory cache |
| `apps/platform-backend/src/chat/platformLinks.ts` | Task links from `PLATFORM_FRONTEND_URL` |
| `apps/platform-backend/src/api/routes/webhooks/chat.routes.ts` | `POST /api/webhooks/slack` (any chat service's adapter name), hands requests to the Chat SDK |
| `apps/platform-backend/src/api/routes/me.ts` | `POST /api/me/chat-links/slack`, links a Slack account by email; links are kept in `user_chat_identities` |
| `apps/platform-backend/src/services/notifications/ChatDmChannel.ts` | DMs to linked users |
| `apps/platform-backend/slack-app-manifest.json` | Slack app manifest |

## Troubleshooting

### Bot doesn't respond to `/viberglass`

- Check that `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` are set. A `503` from `/api/webhooks/slack` means the signing secret is missing.
- Check that the slash command URL matches your backend host and is HTTPS.
- Check the backend logs for "Slack webhook error".

### The form says there are no projects or clankers

- Create a space and an agent in Viberglass first.
- If your Slack account is linked, the form lists only the spaces you can see in Viberglass.

### Replies or buttons get "Link your Slack account…"

- Link the account under **Settings → Notifications**. The Slack account must use the same email as the Viberglass account.

### Build it is refused

- Asking for code needs a linked account and the right to build on that task (the task's people, the space's maintainers or a workspace admin). The bot posts the reason in the thread.

### Thread replies are ignored

- The bot must be in the channel (`/invite @Viberglass`).
- Check that the `message.channels` (and `message.groups` for private channels) event subscriptions are active.
- Only threads of tasks started with `/viberglass` are handled. Other threads are ignored.

### Task links are missing from posts

- Set `PLATFORM_FRONTEND_URL` on the backend.

### Buttons don't do anything

- Check that Interactivity is enabled and its Request URL is `https://{host}/api/webhooks/slack`.
- Check the backend logs for errors.

### Local Development with ngrok

The backend listens on port 8888 by default.

```bash
ngrok http 8888
```

Use the ngrok HTTPS URL as the host for the slash command, interactivity and event subscription URLs (`https://<id>.ngrok.app/api/webhooks/slack`).

## Updating the App

### Updating the Manifest

1. Edit `apps/platform-backend/slack-app-manifest.json`.
2. Apply it with the Slack API:

```bash
curl -X POST https://slack.com/api/apps.manifest.update \
  -H "Authorization: Bearer xoxe-..." \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "YOUR_APP_ID",
    "manifest": '"$(cat apps/platform-backend/slack-app-manifest.json)"'
  }'
```

Or update it by hand in the app settings at [api.slack.com/apps](https://api.slack.com/apps).

### Adding New Scopes

After adding scopes to the manifest, reinstall the app to the workspace so they take effect.
