# Demo fixtures

The public demo runs from a fixture bundle taken from a capture instance. The exporter writes the bundle on a machine that can reach the capture instance's Postgres and object storage. The seeder loads it into an empty demo database and bucket, and a nightly CronJob in the chart repeats that.

## Bundle

A directory with `manifest.json`, `tables/<table>.json` (one array of rows per table) and `objects/<key>` (the objects the rows need, under their original keys). Times are stored as milliseconds from the export. Storage URLs still name the capture bucket; the seeder points them at the demo's.

## Export

```
DEMO_SOURCE_DATABASE_URL=postgres://user:password@host:5432/viberglass \
DEMO_SOURCE_S3_BUCKET=viberglass \
DEMO_SOURCE_S3_ENDPOINT=http://127.0.0.1:9000 \
DEMO_SOURCE_S3_ACCESS_KEY_ID=... DEMO_SOURCE_S3_SECRET_ACCESS_KEY=... \
npx tsx src/demo/export/exportDemo.ts --out ../demo-bundle --config demo-export.json
```

Run it from `apps/platform-backend`. The database connection is read-only. `DEMO_SOURCE_S3_REGION` defaults to `us-east-1` and `DEMO_SOURCE_S3_FORCE_PATH_STYLE` to `true`. The output directory must not exist.

The config file is optional:

```json
{
  "emailDomain": "acme.invalid",
  "emails": { "jussi@example.com": "maria@acme.invalid" },
  "excludeUsers": ["ops@example.com"],
  "spaces": ["website", "customer-app"],
  "viewer": { "sourceEmail": "visitor@example.com", "watchTaskKeys": ["APP-3", "WEB-1"] },
  "githubAccounts": { "Xantier": { "name": "Dev Patel", "login": "devpatel" } },
  "allowedFindings": []
}
```

- `emails` maps capture addresses to demo ones. Everyone else becomes `<first name>@<emailDomain>`. Every capture address is replaced wherever it appears in a row.
- `excludeUsers` leaves people out; rows that need them go too, and optional references to them are cleared.
- `spaces` limits the export to these space slugs. Without it every space is exported.
- `viewer.sourceEmail` names a capture account that stood in for demo visitors, so its watches and mentions carry over. `viewer.watchTaskKeys` are tasks the shared viewer watches.
- `githubAccounts` shows a GitHub account's actions as a persona, for when the capture used one person's token for everyone. A value that is the login, such as `mergedBy` on a merge, becomes `login` (it defaults to the name in lower case without spaces), or `name` under a name key; an avatar beside it becomes `avatarUrl` or is cleared; the login in text becomes `name`, and `@login` the persona's login. Links and `owner/repo` paths keep the real login, and GitHub itself still shows it.
- `allowedFindings` lists exact strings the secret scan reported that someone checked and found harmless.

Only tables listed in `export/tablePolicies.ts` are read. A table without a policy, a new one included, is left out and reported. Secrets, credentials, webhook configs and deliveries, sessions, API tokens, invites, password resets, the audit log, runner config files, MCP servers and skills are never exported. Runners keep their name, harness and model; model endpoints keep their name, base URL, format and model list; integrations keep their name and kind. Password hashes, callback tokens, bootstrap payloads, conversation-state archives and signed links are removed.

Runs captured with older workers show `ta[REDACTED]` where the task's workspace folder `task-<ticket id>` was, because their redactor took the `sk-` in it for an API key. The exporter writes the folder name back into any row it can tie to a task through its session or job; for other rows it writes `task-` and the first 8 characters of the job or row id.

Older Pi workers kept Pi's startup notice (its version, the context files and skills it found, and an update notice) at the start of a reply. The exporter takes it out of turns and their events and works out the turn's intent again from what remains; an event that held only the notice is left out.

Before anything is written the exporter scans every row and object, gzipped ones unpacked, for credential shapes (provider API keys, GitHub and GitLab tokens, bearer tokens, keys in URLs, signed storage links, private keys) and for values the capture database keeps secret: password and token hashes, stored secret ciphertexts, callback tokens and the real addresses of everyone. Any finding stops the export and nothing is written. Litestream replica files are compressed with LZ4 and pass the scan unread.

## Seed

```
node dist/demo/seedDemo.js [--force]
```

It reads the instance's usual `DB_*` or `DATABASE_URL` and `S3_*` settings, plus:

| Variable | |
|---|---|
| `DEMO_FIXTURES_PATH` | A local bundle directory. |
| `DEMO_FIXTURES_BUCKET`, `DEMO_FIXTURES_PREFIX` | The bundle in object storage, read with the instance's storage credentials. Used when `DEMO_FIXTURES_PATH` is unset. |
| `DEMO_VIEWER_EMAIL`, `DEMO_VIEWER_PASSWORD` | The shared viewer account. |
| `DEMO_VIEWER_NAME` | Defaults to "Demo visitor". |
| `DEMO_NEWEST_ACTIVITY_AGE_HOURS` | How long ago the newest task activity, message, turn, job or plan revision lands. Defaults to 24. |

The database must be migrated and empty; `--force` skips the emptiness check. The seeder uploads the objects, then writes every row in one transaction with update triggers off. Every time moves by the same amount. Exported people get a password nobody knows. Jobs get fresh unpublished callback tokens. Apps with a live release are seeded on and stopped, and previews with a release likewise, so the reconcilers start them. Scheduled template runs are paused; app schedules, such as an hourly restore of app data to a manual backup, keep their state.

To test locally from `apps/platform-backend`, use `npx tsx src/demo/seedDemo.ts` with `DEMO_FIXTURES_PATH`.

## Nightly reset

With `demo.enabled` and `demo.reset.enabled`, the chart renders a CronJob (`demo.reset.schedule`, default `30 3 * * *` UTC). Its steps run as init containers in order: scale the backend Deployment to 0, delete the Viberglass-labelled app and preview Deployments, Services, Secrets and volumes in the apps namespace, drop and recreate the public schema, run the migrations, empty the bucket, seed. Its last container scales the backend back up. A failed step leaves the backend at 0.

Values:

- `demo.reset.fixtures.bucket` and `prefix`: where the bundle is. Upload it with `aws s3 sync` or `mc mirror`, for example through a port-forward to the bundled MinIO.
- `demo.reset.viewerSecret`: a Secret with `email` and `password` keys.
- `demo.reset.apiServer.cidrs` and `ports`: where the reset pod may reach the Kubernetes API. Narrow the CIDR to the API server's address where it's known.

The CronJob runs under its own ServiceAccount, allowed to read and update the backend Deployment's scale and, in the apps namespace, to delete Deployments, Secrets and volumes by collection and list and delete Services. Its NetworkPolicy allows DNS, Postgres, object storage and the API server. To run a reset now: `kubectl create job --from=cronjob/<release>-demo-reset demo-reset-now`.
