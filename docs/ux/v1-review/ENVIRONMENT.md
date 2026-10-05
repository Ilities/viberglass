# Isolated UX review environment

The review used its own database, mail sink, fixture repository and local application processes. It did not reuse the normal development database. No application source was modified. All account/task content is fictional. The instance remains running for inspection.

## Addresses and resources

| Resource | Address / name |
|---|---|
| Application | http://localhost:3200 |
| Backend | http://localhost:9088 |
| Local email inbox | http://localhost:8125 |
| SMTP | localhost:1125 |
| PostgreSQL | localhost:5446; database `viberglass-ux-review`; user `uxreview` |
| PostgreSQL container / volume | `viberglass-ux-review-postgres` / `viberglass-ux-review-data` |
| Mail container | `viberglass-ux-review-mail` |
| Read-only fixture Git HTTP | localhost:9089; container URL `http://host.docker.internal:9089/fixture.git` |
| Worker image | `viberglass-ux-review-worker:local` |
| Private logs, credentials, sessions, state | `.tmp/ux-review/` (gitignored) |

The fixture repository contains README.md and greeting.js exporting a function returning `hello`. Dumb HTTP supports cloning and deliberately refuses pushes. The real Code failure at that boundary is environment evidence, not a claim that normal GitHub publication is broken.

## Accounts and work

Read the ignored .tmp/ux-review/accounts.json for fixture login credentials. Do not copy that file into public documentation. Account emails use example.com; none point to real recipients.

| Persona | Fixture account | Access |
|---|---|---|
| Admin | Alex Admin | Workspace admin |
| PM | Maria Product | Member; main-task owner/requester |
| Engineer | Dev Engineer | Member + Storefront maintainer |
| Reviewer | Quinn QA | Guest; Storefront member + main-task reviewer |
| Watcher | Sam Stakeholder | Member; main-task watcher |
| Viewer | Taylor Viewer | Viewer; Storefront member |

Storefront is open. Release planning is private and only the admin belongs to it. The built-in Demo: Acme storefront retains sample data and its own sample agent, separate from the 14 review runners. `STO-7` is the shared research/question/comment/plan/code journey. `STO-8`–`STO-14` are corrected harness compatibility probes. `STO-15` is the manually completed/reopened/archived lifecycle fixture. Earlier bootstrap attempts are retained as history and excluded from compatibility conclusions.

## Isolation and configuration

The backend uses DB_HOST=localhost, DB_PORT=5446 and the separate database above. It has its own encryption keys and instruction/session/media directories, local SMTP, empty Slack settings, OTEL_SDK_DISABLED=true, PLATFORM_FRONTEND_URL=http://localhost:3200 and PLATFORM_API_URL=http://host.docker.internal:9088. The frontend uses VITE_API_URL=http://localhost:9088 and its own Vite cache directory. The standard development ports are untouched by this setup.

The token was read directly from `.zai-token` into encrypted database secrets. It was never included in screenshots or public artifacts. [RUNNERS.md](RUNNERS.md) records endpoint/protocol coverage and limitations. The database volume contains those encrypted credentials and is local operational state, not a distributable review artifact.

## Inspect, recapture, stop and restart

Run from the repository root with Python 3, the installed npm dependencies, Playwright Chromium and Docker available:

```bash
python docs/ux/v1-review/harness/instance.py status
node docs/ux/v1-review/harness/capture.cjs reviewer
```

Capture accepts admin, pm, engineer, reviewer, watcher or viewer. New images go to `.tmp/ux-review/recaptures/<persona>/` so historical evidence is not overwritten. The script captures current read-only pages, not a replay of every mutating interaction. It was verified with the Viewer account. Browser theme follows each fixture account’s setting.

To stop only the recorded frontend/backend/Git processes, then stop the two named review containers while keeping the database volume:

```bash
python docs/ux/v1-review/harness/instance.py stop
docker stop viberglass-ux-review-postgres viberglass-ux-review-mail
```

The helper checks process command identity before signaling it. It does not stop unrelated development processes. All review jobs were terminal when the package was finalized; if you start more runs, cancel them in the application before stopping its backend.

To restart the retained local environment:

```bash
docker start viberglass-ux-review-postgres viberglass-ux-review-mail
python docs/ux/v1-review/harness/instance.py restart
python docs/ux/v1-review/harness/instance.py status
```

Restart reads the saved configuration/encryption keys from ignored `.tmp/ux-review/process-config.json`; it requires these local files and is not a fresh-install script. Wait for PostgreSQL readiness before launching the backend. Restarting the Git fixture recreates the same small source repository, not any externally pushed branch. The screenshot evidence remains unchanged.

## Reproduce on a fresh checkout

1. Install the repository dependencies and build backend/frontend dependencies as described in the root README. Reserve the review ports above or choose new isolated ports consistently.
2. Start PostgreSQL 16 with a new named volume/database and Mailpit v1 on separate ports. Set isolated backend environment values and fresh encryption keys; retain them privately for restart.
3. Run `npm run platform-backend:migrate` with that database configuration. Launch backend/frontend using their own ports and the corresponding API URLs.
4. Register the first admin through the UI, create the open/private spaces, and invite the five other accounts with the access table above. Set the engineer to space maintainer. This was supplemented by application APIs during the review.
5. Start the existing GitFixtureServer from `tests/e2e/playwright/gitFixtureServer.ts` on 9089 and link it as the space repository. The review’s small wrapper and seed helpers remain locally in `.tmp/ux-review/`; they are not a portable migration or production installer.
6. Create the 13 catalog-provider bindings plus Pi using the matrix/configuration described in RUNNERS.md. Supply native credentials for Google/Mistral if testing them; z.ai alone does not validate every harness. Store keys using Secrets.
7. Rebuild the worker and run the role journeys. Record output/status separately from configured bindings. Create a research version, revise it, give inline feedback, answer a blocking question, request a plan, and test failure/cancellation/handoff and manual lifecycle outcomes.

## Worker build provenance

The initial inherited multi-agent image lacked the newly registered Antigravity package and could not bootstrap the current registry. An overlay copied the current compiled worker/plugin packages and their package metadata/symlinks. Pi was then retried after upgrading its global CLI to 1.x; both versions yielded the same empty-artifact outcome.

```bash
npm run build:worker
docker build -f docs/ux/v1-review/harness/Worker.Dockerfile -t viberglass-ux-review-worker:local .
```

The overlay expects `viberator-worker-multi-agent:local` to exist. On a machine without that base image, first build the canonical `infra/workers/docker/viberator-worker-multi-agent.Dockerfile` following the worker documentation. The overlay’s paired dockerignore includes the compiled dist directories. `npm run build:worker` passed; the overlay built successfully. Rebuilding against newer CLI releases may change results; this is a dated review, not a pinned compatibility certification.

## Evidence and limits

[runner-results.json](runner-results.json), [permission-results.json](permission-results.json), [accessibility-results.json](accessibility-results.json), [build-result.json](build-result.json) and [steering-results.json](steering-results.json) contain reduced evidence without tokens. Steering evidence records that handback resumed three old paused sessions (UX-26); two research sessions failed while Claude completed without changed files or PR. Live streaming pause/interrupt, native providers, writable remote PR/merge, Slack and cloud compute remain unverified. See [REPORT.md](REPORT.md).
