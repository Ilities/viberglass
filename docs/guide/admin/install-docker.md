# Install with Docker

The quickest way to try Viberglass: one command on one machine, then a short setup in the browser. Agents run as Docker containers on the same machine.

There are two ways to run it with Docker. The first, below, is for trying Viberglass on your own machine: it runs the development servers with fixed database and encryption keys, so don't expose it to a network. For an installation your team shares on one server, use the [production setup](#on-a-server). For a cluster or the cloud, use [Kubernetes](install-kubernetes.md) or [AWS](install-aws.md).

## Requirements

- Docker Engine 20.10 or newer, with Docker Compose v2.
- Free ports 3000 (the app), 8888 (the API) and 5432 (PostgreSQL).
- A model key from an AI provider, or the address of a compatible model endpoint.
- A GitHub repository, and a fine-grained access token for it.

## Start it

```bash
git clone https://github.com/Ilities/viberglass.git
cd viberglass
docker compose up
```

The first start builds the backend and frontend, so it takes a few minutes. The backend runs its database migrations on startup. When it's up, open http://localhost:3000.

## First-run setup

The first visit asks you to create the administrator account: your name, email and password. Setup then walks through the rest.

1. Connect an AI model. Pick the provider that issued your key and paste it; setup checks it with the provider. Or choose Custom endpoint for a provider such as z.ai or a model you run yourself: enter the API base URL, the API it speaks, the endpoint's key and a model (Find models lists them). See [Agents and models](agents-and-models.md).
2. Point at your repository. Enter the GitHub repository and an access token. "Create a token with the right permissions" opens GitHub's fine-grained token form with what the agent needs filled in: write access to Contents and Pull requests. Setup checks the token with GitHub.
3. Name your first space.
4. Getting your agent ready. Setup creates a default agent for your key and starts it on Docker. The first time, this downloads the agent's image and takes a couple of minutes.
5. Try your first task. Setup suggests a starter task that only reads your code; choose Write the plan to run it.

To look around before connecting anything, choose Explore a demo workspace on setup's first screen. It loads a sample space with tasks in different states. Its tasks don't run agents. Remove demo, in the demo's banner, deletes exactly what it added.

![Setup's model step](../images/setup-model-key.png)

## Worker images

Agents run in worker images pulled from `ghcr.io/ilities`, one per coding agent. To use images you built yourself, set `VIBERATOR_WORKER_REGISTRY` to empty in a `.env` file in the repository root, and restart the backend.

## Optional services

Optional settings go in a `.env` file in the repository root. Restart the backend after changing it with `docker compose up -d backend`.

- Email: Mailpit catches mail locally. Set `EMAIL_FROM` and `SMTP_URL=smtp://mailpit:1025`, then start it with `docker compose --profile mail up -d`. Its inbox is at http://localhost:8025. For real delivery, point `SMTP_URL` at your SMTP server.
- Slack: set `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`. Slack needs to reach the backend over HTTPS, so locally you need a tunnel such as ngrok. See [Repositories and integrations](repositories-and-integrations.md#slack).
- Traces: `docker compose --profile langfuse up -d` starts Langfuse for looking at agent traces.

More detail is in [local development](https://github.com/Ilities/viberglass/blob/main/docs/local-development.md).

## Stop and start

`docker compose down` stops everything; your data stays in Docker volumes. `docker compose up` starts it again. To update, `git pull` and run `docker compose up --build`. See [Upgrades and backups](upgrades-and-backups.md).

## On a server

`docker-compose.prod.yml` runs Viberglass on one Linux server from the published images: PostgreSQL, the backend, the frontend and, optionally, Caddy for HTTPS. Nothing is built on the server, and the passwords and keys come from a `.env` file.

You need:

- A Linux server with Docker Engine 20.10 or newer and Docker Compose v2, and about 20 GB of free disk for agent images.
- A domain name pointing at the server, with ports 80 and 443 open, for HTTPS. Sign-in cookies only work over HTTPS.
- A model key, and a GitHub repository with an access token, as above.

```bash
git clone https://github.com/Ilities/viberglass.git
cd viberglass
git checkout v1.0.0   # the release you want to run
cp .env.production.example .env
```

Fill in `.env`:

- `VIBERGLASS_URL`: the HTTPS address people open, such as `https://viberglass.example.com`.
- `VIBERGLASS_DOMAIN`: the same domain without `https://`, for the certificate.
- `DB_PASSWORD`, `SECRETS_ENCRYPTION_KEY` and `WEBHOOK_SECRET_ENCRYPTION_KEY`: generate each with `openssl rand -hex 32`. Keep a copy of the two keys somewhere safe. Without them, the credentials Viberglass stores can't be read.
- `VIBERGLASS_VERSION`: the same release tag, so the images match. `latest` follows the main branch.

Then start it with HTTPS:

```bash
docker compose -f docker-compose.prod.yml --profile https up -d
```

Caddy gets a Let's Encrypt certificate for your domain on the first request. Open your address and go through [first-run setup](#first-run-setup). The backend runs the database migrations each time it starts.

If you already have a reverse proxy, leave out `--profile https` and point the proxy at `127.0.0.1:8080`, the frontend. It serves the app and passes `/api` to the backend.

What else to know:

- Agents run as containers on the same server. The backend starts them through the Docker socket, so treat access to the backend container as root access to the server.
- Agent containers call the backend back on the Docker bridge address, `172.17.0.1:8888`, which isn't reachable from outside the server. If `ip addr show docker0` shows another address, set `VIBERGLASS_WORKER_API_BIND` in `.env`.
- Task media, saved agent sessions, instruction files and skills are kept in `/var/lib/viberglass` (`VIBERGLASS_DATA_DIR`), and the database in the `viberglass_postgres-data` volume. Back up both, and `.env`.
- Optional email, Slack and trace settings are in `.env.production.example`.

To upgrade, set `VIBERGLASS_VERSION` to the new release in `.env`, then run `docker compose -f docker-compose.prod.yml --profile https pull` and `docker compose -f docker-compose.prod.yml --profile https up -d`. Back up the database first; see [Upgrades and backups](upgrades-and-backups.md).
