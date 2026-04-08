# Slack Integration

Viberglass integrates with Slack via the [Vercel Chat SDK](https://github.com/vercel/chat), allowing users to create tickets, run AI agent jobs, and advance those jobs through research → planning → execution phases — all from a Slack thread.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Creating the Slack App](#creating-the-slack-app)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Updating the App](#updating-the-app)

## Overview

The integration provides:

- `/viberator` slash command that opens a modal to create a ticket and launch the first AI agent job
- Job progress streamed into a Slack thread (documents posted on completion, PR link on execution finish)
- Keyword commands in thread mentions to advance or revise the current phase
- Chained phase execution (e.g. research → planning → execution in one command)
- Approve/Reject buttons when the agent needs approval during execution

## Prerequisites

- A Slack workspace with admin permissions to install apps
- The platform backend running and accessible via HTTPS (use ngrok for local dev)
- At least one project and one clanker configured in Viberator

## Creating the Slack App

### Option A: From Manifest (Recommended)

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** > **From a manifest**
3. Select your workspace
4. Paste the contents of `apps/platform-backend/slack-app-manifest.json`
5. Replace all `YOUR_HOST` values with your actual backend host
6. Click **Create**
7. Install the app to your workspace

### Option B: Via Slack API

```bash
# Create the app from the manifest file
curl -X POST https://slack.com/api/apps.manifest.create \
  -H "Authorization: Bearer xoxe-..." \
  -H "Content-Type: application/json" \
  -d @apps/platform-backend/slack-app-manifest.json
```

### Option C: Manual Setup

1. Create a new app at [api.slack.com/apps](https://api.slack.com/apps) > **From scratch**
2. **Bot User**: Set display name to "Viberator", enable "Always Online"
3. **OAuth Scopes** (Bot Token): `commands`, `chat:write`, `chat:write.public`, `channels:read`, `channels:history`, `groups:read`, `groups:history`, `im:read`, `im:history`, `users:read`, `files:write`
4. **Slash Commands**: Create `/viberator` pointing to `https://{host}/api/webhooks/slack`
5. **Interactivity**: Enable, set Request URL to `https://{host}/api/webhooks/slack`
6. **Event Subscriptions**: Enable, set Request URL to `https://{host}/api/webhooks/slack`, subscribe to `message.channels` and `message.groups`
7. Install to workspace

### Collect Credentials

After creating the app:

1. Go to **OAuth & Permissions** > copy the **Bot User OAuth Token** (`xoxb-...`)
2. Go to **Basic Information** > copy the **Signing Secret**

## Configuration

Add these environment variables to the platform backend:

```bash
# Slack Bot Token (from OAuth & Permissions page)
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Slack Signing Secret (from Basic Information page)
SLACK_SIGNING_SECRET=your-signing-secret
```

The Chat SDK's PostgreSQL state adapter reuses the existing `DATABASE_URL` (or `DB_HOST`/`DB_PORT`/etc.) for persisting thread subscriptions.

## Architecture

```
Slack workspace
  │
  ├── /viberator slash command
  │     ↓
  │   POST /api/webhooks/slack
  │     ↓
  │   Chat SDK Slack adapter (verifies signing secret)
  │     ↓
  │   slashCommand handler → opens Modal
  │     ↓
  │   modalSubmit handler
  │     ├── TicketDAO.createTicket()
  │     ├── TicketPhaseOrchestrationService.advanceAndRun()
  │     ├── Posts thread root to channel (ticket link + prompt)
  │     └── TicketJobBridge.startBridge()
  │           ↓
  │         Polls JobService every 2s
  │         On completion: posts document (research/planning) or PR link (execution)
  │         If chainTo set: auto-advances to next phase via callbacks.advanceAndRun()
  │
  ├── @viberator mention in ticket thread
  │     ↓
  │   threadMention handler
  │     ├── resolveTicketAdvance(instruction, currentPhase)
  │     │     → "advance": advanceAndRunTicketJob()
  │     │     → "chain":   chainAndRunTicketJob() [e.g. planning→execution]
  │     │     → (default): runRevisionJob()
  │     └── TicketJobBridge.startBridge() for follow-up job
  │
  └── Approve/Reject button click
        ↓
      onAction handler
        └── AgentSessionInteractionService.approve()
```

### Key Files

| File | Purpose |
|------|---------|
| `src/chat/bot.ts` | Chat SDK instance with Slack adapter + PG state |
| `src/chat/index.ts` | Entry point — registers all handlers, wires TicketPhaseOrchestrationService |
| `src/chat/TicketJobBridge.ts` | Polls job status, posts documents/PR links, chains phases on completion |
| `src/chat/ticketThreadMap.ts` | DB-backed ticketId ↔ thread mapping (with in-memory cache) |
| `src/chat/sessionThreadMap.ts` | DB-backed sessionId ↔ thread mapping (legacy session path) |
| `src/chat/ChatSessionBridgeService.ts` | Polls session events, streams to thread (legacy session path) |
| `src/services/TicketPhaseOrchestrationService.ts` | Composes workflow/approval/research/planning/execution into a single `advanceAndRun` entry point |
| `src/persistence/chat/ChatTicketThreadDAO.ts` | DAO for ticket ↔ thread mapping persistence |
| `src/chat/handlers/slashCommand.ts` | `/viberator` → modal with project/clanker/mode/message |
| `src/chat/handlers/modalSubmit.ts` | Creates ticket, launches first job, subscribes thread |
| `packages/chat-slack/src/handlers/threadMention.ts` | Routes @mentions to advance/chain/revise handlers |
| `packages/chat-slack/src/handlers/approvalAction.ts` | Handles approve/reject button clicks |
| `slack-app-manifest.json` | Slack app manifest for IaC deployment |

## Usage

### Launching a Job

1. Invite the bot to a channel: `/invite @Viberator`
2. Type `/viberator` in the channel
3. Fill in the modal:
   - **Project**: Select the target project
   - **Clanker**: Select the agent to use
   - **Mode**: Research, Planning, or Execution
   - **Message**: Describe the task
4. Click **Launch**
5. The bot creates a ticket, starts the job, and posts a thread with a link to the ticket

### Advancing Phases with Keyword Commands

Once a job completes, @mention the bot in the thread with a keyword to move to the next phase. Keywords are case-insensitive and trailing/leading punctuation is stripped (so `lgtm!` and `LGTM.` both work).

| Keyword(s) | Current phase | Action |
|---|---|---|
| `plan` / `plan it` / `start planning` / `move to planning` | Research | Advance to planning |
| `lgtm` / `approved` / `looks good` / `approve` | Research | Advance to planning |
| `next` / `proceed` / `continue` | Research | Advance to planning |
| `next` / `proceed` / `continue` | Planning | Advance to execution |
| `execute` / `do it` / `let's go` / `ship it` / `run it` / `go` / `start execution` | Planning | Advance to execution |
| `lgtm` / `approved` / `looks good` / `approve` | Planning | Advance to execution |
| `execute` / `do it` / `ship it` / `go` (and similar) | Research | **Chain**: run planning then auto-advance to execution |
| *(any other text)* | Research or Planning | Revision job with your message as feedback |
| *(any text)* | Execution | Rejected — execution phase cannot be revised |

### Thread Lifecycle

| Event | Slack message posted |
|---|---|
| Job launched | Thread root with ticket link and initial prompt |
| Research job completes | `research.md` file attachment + advance prompt |
| Planning job completes | `planning.md` file attachment + advance prompt |
| Execution job completes | Pull request URL + ticket link |
| Chain auto-advance | _Advancing to planning…_ (then proceeds automatically) |
| Job failed | _Job failed. An error occurred during processing._ |
| Revision queued | _Revision job queued…_ |
| Phase advanced | _Advancing to {phase}…_ |
| Chain triggered | _Advancing to {firstPhase} (will auto-continue to {thenPhase})…_ |

### Approvals During Execution

If the agent requests approval (e.g. before destructive operations), the bot posts a card with **Approve** and **Reject** buttons directly in the thread.

## Troubleshooting

### Bot doesn't respond to `/viberator`

- Verify `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` are set
- Check that the slash command URL matches your backend host
- Ensure the backend is reachable over HTTPS (Slack requires HTTPS)
- Check backend logs for webhook errors

### Modal opens but submit fails

- Verify at least one project and one clanker exist in Viberator
- Check backend logs for ticket creation or job launch errors
- Ensure the bot has `chat:write` scope for the target channel

### @mention keywords are not recognised

- The bot strips punctuation and lowercases input — `LGTM!` and `lgtm` are equivalent
- Execution-phase threads will reject all commands with a message explaining this
- If no keyword matches, the input is treated as a revision request

### Thread replies are ignored

- The bot must be in the channel (invite with `/invite @Viberator`)
- Check that `message.channels` event subscription is active
- Ticket-to-thread mappings are stored in the database; active bridges resume automatically on backend restart

### PR link never appears in thread

- The execution job must complete successfully and return a `pullRequestUrl` in its result
- Check backend logs for `TicketJobBridge` poll errors
- The PR URL is also saved to the ticket so the UI reflects it without a manual refresh

### "Approval Required" buttons don't work

- Verify Interactivity is enabled in Slack app settings
- The Request URL must match the webhook URL
- Check backend logs for action handler errors

### Local Development with ngrok

```bash
# Start ngrok tunnel
ngrok http 8888

# Use the HTTPS URL from ngrok as your webhook URL
# Update the Slack app's slash command, interactivity, and event subscription URLs
```

## Updating the App

### Updating the Manifest

1. Edit `apps/platform-backend/slack-app-manifest.json`
2. Apply via the Slack API:

```bash
curl -X POST https://slack.com/api/apps.manifest.update \
  -H "Authorization: Bearer xoxe-..." \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "YOUR_APP_ID",
    "manifest": '$(cat apps/platform-backend/slack-app-manifest.json)'
  }'
```

Or update manually in the Slack app settings at [api.slack.com/apps](https://api.slack.com/apps).

### Adding New Scopes

If new scopes are added to the manifest, the app must be reinstalled to the workspace for the new scopes to take effect.
