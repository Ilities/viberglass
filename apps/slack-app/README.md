# Viberglass Slack App

This package hosts the Slack app used to install Viberglass into a workspace.
It handles OAuth installation, stores bot tokens locally, and provides minimal
slash command/event wiring so the app is active after install.

## Quick start

1. Create a public URL for local dev (ngrok, cloudflared, etc.).
2. Import the app manifest from `slack-app-manifest.yaml` and replace the URLs.
3. Copy `.env.example` to `.env` and fill in the Slack app secrets.
4. Start the app:

```bash
npm run dev -w @viberglass/slack-app
```

Then visit `https://YOUR_PUBLIC_URL/slack/install` to install the app.

## Tokens

After installation, the bot token is stored in
`apps/slack-app/data/slack-installations.json`. Use that token in the
Viberglass Slack integration configuration (channel ID + bot token).

## AWS Lambda

The Slack app can run on AWS Lambda using the Lambda container image defined in
`apps/slack-app/Dockerfile.lambda`. When running in Lambda, set
`SLACK_INSTALLATION_STORE_TABLE` to a DynamoDB table name to persist
installations instead of the local JSON file.

## Environment variables

- `SLACK_CLIENT_ID` - Slack app client ID
- `SLACK_CLIENT_SECRET` - Slack app client secret
- `SLACK_SIGNING_SECRET` - Slack signing secret
- `SLACK_STATE_SECRET` - Random string for OAuth state verification
- `SLACK_APP_BASE_URL` - Public base URL for install links
- `SLACK_SCOPES` - Comma-delimited bot scopes override
- `SLACK_INSTALLATION_STORE_PATH` - Storage path for installations
- `SLACK_INSTALLATION_STORE_TABLE` - DynamoDB table name for installations
- `SLACK_LOG_LEVEL` - debug | info | warn | error
- `PORT` - Server port (default: 4000)
