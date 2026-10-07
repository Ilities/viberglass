# Manual test instances

Helpers for the two local instances the manual test suite in [docs/testing/e2e-manual](../../docs/testing/e2e-manual/README.md) runs against. They're isolated from the normal development setup: their own database, mail sink, ports and worker image. Their configuration, keys and fixture accounts live in the gitignored `.tmp/ux-review/` and `.tmp/ux-fresh/`, so the helpers restart an existing instance; they don't create one from nothing.

| Instance | App | Backend | Use it for |
|---|---|---|---|
| L-REV, with fixtures (people, spaces, tasks, runners) | http://localhost:3200 | http://localhost:9088 | Everything except first-run setup |
| L-NEW, empty | http://localhost:3201 | | Registration and first-run setup |
| Local mail, both | http://localhost:8125 | | Invites and notification emails |

PostgreSQL for both runs in the `viberglass-ux-review-postgres` container on port 5446, and mail in `viberglass-ux-review-mail`. Fixture logins are in `.tmp/ux-review/accounts.json`.

## Status, stop and restart

From the repository root, with Python 3, the npm dependencies, Playwright Chromium and Docker:

```bash
python3 tests/manual-harness/instance.py status
python3 tests/manual-harness/instance.py stop
docker start viberglass-ux-review-postgres viberglass-ux-review-mail
python3 tests/manual-harness/instance.py restart
```

The helper only signals the processes it started. The empty instance has its own copy at `.tmp/ux-fresh/instance.py`.

## Screenshots

```bash
node tests/manual-harness/capture.cjs reviewer
```

Captures the read-only pages as one fixture account (admin, pm, engineer, reviewer, watcher or viewer) into `.tmp/ux-review/recaptures/<persona>/`.

## Worker image

The review runners use `viberglass-ux-review-worker:local`, an overlay of the current compiled worker packages on the multi-agent image:

```bash
npm run build:worker
docker build -f tests/manual-harness/Worker.Dockerfile -t viberglass-ux-review-worker:local .
```

It expects `viberator-worker-multi-agent:local`; build that first from `infra/workers/docker/viberator-worker-multi-agent.Dockerfile` if it's missing.

## Starting the empty instance over

```bash
python3 .tmp/ux-fresh/instance.py stop
docker exec viberglass-ux-review-postgres dropdb -U uxreview viberglass-ux-fresh
docker exec viberglass-ux-review-postgres createdb -U uxreview viberglass-ux-fresh
# run the migrator with the backend environment from .tmp/ux-fresh/process-config.json, then:
python3 .tmp/ux-fresh/instance.py restart
```
