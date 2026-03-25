# Slack Integration

Viberglass integrates with Slack via the [Vercel Chat SDK](https://github.com/vercel/chat), allowing users to launch agent sessions from Slack and interact with them in threads.

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

- `/viberator` slash command that opens a modal to configure and launch an agent session
- Session events streamed into a Slack thread (assistant messages, status updates)
- Thread replies forwarded to the agent session as user messages
- Approve/Reject buttons for agent approval requests

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
3. **OAuth Scopes** (Bot Token): `commands`, `chat:write`, `chat:write.public`, `channels:read`, `channels:history`, `groups:read`, `groups:history`, `im:read`, `im:history`
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

### Database Migration

Session-to-thread mappings are stored in a `slack_session_threads` table so that active bridges survive backend restarts. Run the migration before first use:

```bash
npm run migrate:latest
```

This creates the `slack_session_threads` table (migration `050_add_slack_session_threads`). On startup, the backend automatically resumes event bridges for any active sessions that had a Slack thread attached.

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
  │     ├── AgentSessionLaunchService.launch()
  │     ├── Posts thread root to channel
  │     └── ChatSessionBridgeService.startBridge()
  │           ↓
  │         Polls AgentSessionQueryService.listEvents()
  │         every 2s, posts events to Slack thread
  │
  ├── Thread reply from user
  │     ↓
  │   onSubscribedMessage handler
  │     ├── Maps thread → sessionId (sessionThreadMap)
  │     └── AgentSessionInteractionService.sendMessage() or .reply()
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
| `src/chat/index.ts` | Entry point — registers all handlers |
| `src/chat/sessionThreadMap.ts` | DB-backed sessionId ↔ thread mapping (with in-memory cache) |
| `src/chat/ChatSessionBridgeService.ts` | Polls session events, streams to Slack thread, resumes on restart |
| `src/persistence/chat/SlackSessionThreadDAO.ts` | DAO for `slack_session_threads` table |
| `src/migrations/050_add_slack_session_threads.ts` | Migration for thread mapping persistence |
| `src/chat/handlers/slashCommand.ts` | `/viberator` → modal with project/clanker/mode/message |
| `src/chat/handlers/modalSubmit.ts` | Creates ticket, launches session, subscribes thread |
| `src/chat/handlers/threadReply.ts` | Routes thread replies to agent session |
| `src/chat/handlers/approvalAction.ts` | Handles approve/reject button clicks |
| `slack-app-manifest.json` | Slack app manifest for IaC deployment |

## Usage

### Launching a Session

1. Type `/viberator` in any channel where the bot is present
2. Fill in the modal:
   - **Project**: Select the target project
   - **Clanker**: Select the agent to use
   - **Mode**: Research, Planning, or Execution
   - **Message**: Describe what you want the agent to do
3. Click **Launch**
4. The bot posts a thread with session details and starts streaming events

### Interacting with a Session

- **Reply in the thread** to send messages to the agent
- When the agent **needs input**, it will prompt you — reply in the thread
- When the agent **needs approval**, click the **Approve** or **Reject** button
- The thread updates with agent messages, status changes, and completion

### Session Lifecycle in Slack

| Agent Event | Slack Message |
|-------------|---------------|
| Turn started | _Agent is working..._ |
| Assistant message | Bot message with markdown content |
| Needs input | Prompt + "Reply in this thread" |
| Needs approval | Card with Approve/Reject buttons |
| Session completed | *Session completed.* |
| Session failed | *Session failed:* {reason} |
| Session cancelled | *Session cancelled.* |

## Troubleshooting

### Bot doesn't respond to `/viberator`

- Verify `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` are set
- Check that the slash command URL matches your backend host
- Ensure the backend is reachable over HTTPS (Slack requires HTTPS)
- Check backend logs for webhook errors

### Modal opens but submit fails

- Verify at least one project and one clanker exist in Viberator
- Check backend logs for ticket creation or session launch errors
- Ensure the bot has `chat:write` scope for the target channel

### Thread replies are ignored

- The bot must be in the channel (invite with `/invite @Viberator`)
- Check that `message.channels` event subscription is active
- Session-to-thread mappings are stored in the database and survive restarts; active bridges resume automatically on startup

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
