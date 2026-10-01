# Local development

`docker compose up` runs everything you need: Postgres (5432), the backend (8888, hot reload, runs migrations on start) and the frontend (http://localhost:3000, Vite HMR). Opening the app against an empty database walks you through creating the first admin and then setup (model key, repository, space).

Optional services sit behind compose profiles, so a plain `docker compose up` never starts them:

| Profile | Starts | Use it for |
|---|---|---|
| `mail` | Mailpit, inbox at http://localhost:8025 | reading invite links, notifications and test emails |
| `langfuse` | Langfuse on http://localhost:3001 | looking at traces ([telemetry-local.md](./telemetry-local.md)) |

## Where settings go

With compose, the backend's environment comes from `docker-compose.yml`. Optional settings are passed through from a `.env` file **in the repository root**, which compose reads by itself; leave a setting out and the feature stays off. Restart the backend after changing it:

```bash
docker compose up -d backend
```

Running the backend outside compose (`npm run dev -w @viberglass/platform-backend`), it reads `apps/platform-backend/.env` instead; start from `apps/platform-backend/.env.example`.

## Email

Nothing is emailed until both `EMAIL_FROM` and a transport are set. Locally the transport is SMTP, and Mailpit catches everything so no real mail leaves your machine.

Root `.env`:

```bash
EMAIL_FROM="Viberglass <viberglass@localhost>"
SMTP_URL=smtp://mailpit:1025
```

```bash
docker compose --profile mail up -d
docker compose up -d backend
```

Then, as an admin, open **Settings → Notifications → Send test email** and read it at http://localhost:8025. Invites created under Settings → Members are emailed the same way.

To send through a real SMTP server instead, set `SMTP_URL` to it, e.g. `smtp://user:password@smtp.example.com:587` (URL-encode special characters in the password). On AWS the platform stack uses SES instead (`EMAIL_PROVIDER=ses`, set by the stack; see `emailDomain` in `infra/platform/Pulumi.*.yaml.example`).

## Slack

Root `.env`, with the bot token and signing secret of a Slack app created from the manifest under **Settings → Connections → Slack** ([slack-integration.md](./operations/slack-integration.md)):

```bash
SLACK_BOT_TOKEN=xoxb-…
SLACK_SIGNING_SECRET=…
```

Slack must reach the backend's webhook over HTTPS, so locally you need a tunnel (e.g. `ngrok http 8888`) set as the app's request URL. Once it's running, each person links their account under **Settings → Notifications → Link Slack** to get DMs.

## Tests

- Unit tests: one suite at a time, e.g. `(cd apps/platform-backend && npx jest --maxWorkers=2 src/__tests__/unit)`. See [TESTING.md](../TESTING.md).
- The smoke suite (`npm run test:e2e`) starts its own backend, frontend, Postgres and worker containers on separate ports; don't run it alongside other suites.
- After changing `packages/types` or adding a dependency, rebuild the matching dev container: `docker compose build frontend` (or `backend`), then `docker compose up -d frontend`.
