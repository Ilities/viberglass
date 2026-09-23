# Local telemetry

Tracing is **off** by default. The backend logs which state it is in on boot:

```
OpenTelemetry tracing disabled — set OTEL_EXPORTER_OTLP_ENDPOINT or VIBERGLASS_OTEL_CONSOLE=true to enable
```

There are three ways to look at spans locally, in increasing order of effort.

## 1. No collector — spans to stdout

```bash
VIBERGLASS_OTEL_CONSOLE=true docker compose up -d backend
docker compose logs -f backend
```

Same switch works for the standalone export check, which does not need the
stack running at all:

```bash
VIBERGLASS_OTEL_CONSOLE=true npm run smoke:export -w @viberglass/telemetry
```

That emits `job.dispatch → job.execute → invoke_agent`, passing trace context
between the first two through a serialized carrier exactly as the bootstrap
payload does. All three must share one `traceId`, and `job.execute` must show
`parentSpanContext.isRemote: true`. Two trace ids means the carrier is broken.

## 2. Langfuse

A full Langfuse v4 stack ships in `docker-compose.yml` behind the `langfuse`
profile, so it never starts with a plain `docker compose up`.

```bash
docker compose --profile langfuse up -d
```

First boot pulls ClickHouse and runs migrations — allow a couple of minutes
before the UI answers. Then point the backend at it:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://langfuse-web:3000/api/public/otel \
OTEL_EXPORTER_OTLP_HEADERS='Authorization=Basic cGstbGYtdmliZXJnbGFzcy1kZXY6c2stbGYtdmliZXJnbGFzcy1kZXY=' \
  docker compose up -d backend
```

The endpoint is the generic one, so `/v1/traces` is appended per the OTLP
exporter spec — the full URL becomes `/api/public/otel/v1/traces`, which is
what Langfuse expects.

| | |
|---|---|
| UI | http://localhost:3001 (3000 is the frontend) |
| Login | `dev@viberglass.local` / `langfuse-dev` |
| Public key | `pk-lf-viberglass-dev` |
| Secret key | `sk-lf-viberglass-dev` |

The org, project, user and key pair are seeded by `LANGFUSE_INIT_*` on first
boot, which is why the `Authorization` header above can be a fixed literal —
it is `base64("pk-lf-viberglass-dev:sk-lf-viberglass-dev")`.

### Confirming spans actually arrived

Langfuse v4 stores OTel spans in the ClickHouse `events_core` / `events_full`
tables. The legacy `traces` and `observations` tables stay empty, so
`GET /api/public/traces` returns `{"data":[]}` even when ingestion is working —
do not read that as a failure. Check the UI, or query directly:

```bash
docker compose exec -T langfuse-clickhouse \
  clickhouse-client --user clickhouse --password clickhouse -q \
  "SELECT substring(trace_id,1,12) AS trace, substring(span_id,1,8) AS span,
          substring(parent_span_id,1,8) AS parent, name
   FROM events_full ORDER BY trace_id, start_time FORMAT PrettyCompactMonoBlock"
```

A healthy `smoke:export` run against Langfuse looks like this — one trace id,
three spans, each parented to the one above:

```
┌─trace────────┬─span─────┬─parent───┬─name─────────────────────┐
│ 4c4ea9f003c3 │ 37feb16f │          │ job.dispatch             │
│ 4c4ea9f003c3 │ 54b9d450 │ 37feb16f │ job.execute              │
│ 4c4ea9f003c3 │ c943761a │ 54b9d450 │ invoke_agent smoke-agent │
└──────────────┴──────────┴──────────┴──────────────────────────┘
```

Ingestion is asynchronous — the HTTP POST only enqueues a job that the
`langfuse-worker` drains — so allow a few seconds before querying.

### If ClickHouse auth fails

`langfuse-web` crash-looping on

```
code: 516, message: clickhouse: Authentication failed
Applying clickhouse migrations failed.
```

means the `clickhouse` user was never created. That user is only set up on a
**first** boot against an empty data directory, so changing `CLICKHOUSE_USER` /
`CLICKHOUSE_PASSWORD` after the fact requires discarding the volume:

```bash
docker compose stop langfuse-web langfuse-worker langfuse-clickhouse
docker rm -f viberglass-dev-langfuse-clickhouse
docker volume rm viberglass-langfuse-clickhouse-data viberglass-langfuse-clickhouse-logs
docker compose --profile langfuse up -d
```

Shut it down without touching the platform stack:

```bash
docker compose --profile langfuse down          # keep trace history
docker compose --profile langfuse down -v       # drop it
```

### Ports and collisions

Langfuse's own defaults collide with this repo's, so they are remapped:

| Service | Upstream default | Here |
|---|---|---|
| `langfuse-web` | 3000 | **3001** (frontend owns 3000) |
| `langfuse-postgres` | 5432 | not published (platform DB owns 5432) |
| `langfuse-clickhouse` | 8123 / 9000 | not published |
| `langfuse-minio` | 9090 / 9091 | not published |
| `langfuse-redis` | 6379 | not published |

Only the UI is reachable from the host; everything else is internal to
`viberglass-dev-network`.

### These credentials are development-only

Every secret in the `langfuse` profile — `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`,
`SALT`, the database and MinIO passwords, the seeded API keys — is a hardcoded
literal committed to the repo. The profile is not fit to expose off localhost
as it stands.

## 3. Any other OTLP backend

The exporter is generic OTLP/HTTP. Jaeger, Grafana Tempo, Braintrust and
anything else OTLP-shaped work with no code change:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 docker compose up -d backend
```

## Turning it back off

Tracing is only on while the variables are set. Because `docker compose up`
re-reads the environment, an unadorned restart reverts to off:

```bash
docker compose up -d backend
```

## Content capture

`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` attaches prompts and
completions to spans. Prompts embed ticket bodies from untrusted webhook
senders and completions embed repository source, so this ships that content to
whatever backend is configured. Off by default. Without it, spans carry a
SHA-256 prompt hash and a character count.
