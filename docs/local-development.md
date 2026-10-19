# Local development

`docker-compose.dev.yml` runs the dev servers on your checkout: Postgres (5432), MinIO object storage (9000, console on http://localhost:9001, sign in as `viberglass` / `viberglass-dev-storage`), the backend (8888, hot reload, runs migrations on start) and the frontend (http://localhost:3000, Vite HMR). To try Viberglass without changing it, use `docker-compose.yml` instead ([Install with Docker](guide/admin/install-docker.md)); it runs the published images.

The backend container loads the workspace packages under `packages/` from your checkout, through their `dist/`. Build them on the host before the first start, and again after changing one:

```bash
npm ci
npm run backend:build-deps          # all of them
npm run build -w @viberglass/types  # or the one you changed
docker compose -f docker-compose.dev.yml up -d
```

Set `COMPOSE_FILE=docker-compose.dev.yml` in the root `.env` to leave out the `-f`; the commands below assume you have.

Files spaces, ticket media and plan documents are stored in MinIO's `viberglass-dev` bucket. Docker workers reach it through `host.docker.internal:9000`. Artifact previews are served from a separate origin, http://127.0.0.1:8890, so their scripts never share the app's origin or cookies. Saved agent conversations are kept in `~/.viberglass` (or `VIBERGLASS_DATA_DIR` from the root `.env`), so they survive restarts. Opening the app against an empty database walks you through creating the first admin and then setup (model key, repository, space).

Optional services sit behind compose profiles, so a plain `docker compose up` never starts them:

| Profile | Starts | Use it for |
|---|---|---|
| `mail` | Mailpit, inbox at http://localhost:8025 | reading invite links, notifications and test emails |
| `langfuse` | Langfuse on http://localhost:3001 | looking at traces ([telemetry-local.md](./telemetry-local.md)) |

## Where settings go

With compose, the backend's environment comes from `docker-compose.dev.yml`. Optional settings are passed through from a `.env` file **in the repository root**, which compose reads by itself; leave a setting out and the feature stays off. Restart the backend after changing it:

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

Create a Slack app from the manifest under Settings → Connections → Slack, then enter its bot token and signing secret on the same screen and save ([slack-integration.md](./operations/slack-integration.md)). The running backend picks them up without a restart.

Slack must reach the backend's webhook over HTTPS, so locally you need a tunnel (e.g. `ngrok http 8888`) set as the app's request URL. Once it's running, each person links their account under **Settings → Notifications → Link Slack** to get DMs.

## Tests

- Unit tests: one suite at a time, e.g. `(cd apps/platform-backend && npx jest --maxWorkers=2 src/__tests__/unit)`. See [TESTING.md](../TESTING.md).
- The smoke suite (`npm run test:e2e`) starts its own backend, frontend, Postgres and worker containers on separate ports; don't run it alongside other suites.
- After adding a dependency, rebuild the matching dev container: `docker compose build frontend` (or `backend`), then `docker compose up -d frontend`.
