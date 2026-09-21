# @viberglass/telemetry

OpenTelemetry tracing for the Viberglass job lifecycle, pinned to the GenAI
semantic conventions.

One job produces **one trace** spanning two processes: the platform backend
that dispatches it and the ephemeral worker that runs it.

## Why this package exists

The plan needs traces that can later serve as an eval
corpus. That imposes three constraints ordinary app tracing does not:

1. **The convention revision must be pinned and recorded.** GenAI conventions
   are still `development` stability and the names have churned
   (`gen_ai.system` → `gen_ai.provider.name`). A dependency bump that silently
   renames attributes invalidates every trace recorded before it.
2. **Absent data must be recorded as absent.** Most agent CLIs report no token
   usage. Backfilling from a per-plugin cost constant makes an estimate
   indistinguishable from a measurement.
3. **Context must cross a non-HTTP boundary.** The backend dispatches to
   Lambda, ECS and Docker. There is no request to hang headers on.

## Configuration

Tracing is **off** unless an exporter is configured. With none, the OTel API's
no-op tracer is used and there is no measurable overhead.

| Variable | Purpose |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base OTLP/HTTP endpoint. `/v1/traces` is appended. Setting it enables tracing. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Full traces URL, used verbatim; overrides the above. |
| `OTEL_EXPORTER_OTLP_HEADERS` | `k1=v1,k2=v2`. Values are percent-decoded. |
| `OTEL_SERVICE_NAME` | Overrides the per-process default. |
| `OTEL_SDK_DISABLED` | `true` disables tracing even with an endpoint set. |
| `OTEL_TRACES_SAMPLER_ARG` | Head sampling ratio `0..1`, default `1`. Parent decisions are respected. |
| `OTEL_LOG_LEVEL` | Enables OTel's internal diagnostic logger. |
| `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` | `true` attaches prompts/completions to spans. **Off by default** — see below. |
| `VIBERGLASS_OTEL_CONSOLE` | `true` prints spans to stdout. Enables tracing on its own. |
| `VIBERGLASS_DEPLOYMENT_ENV` | `deployment.environment.name`; falls back to `NODE_ENV`. |
| `VIBERGLASS_VERSION` | `service.version`. |

Local development:

```bash
VIBERGLASS_OTEL_CONSOLE=true npm run platform-backend:dev
```

Against a collector:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm run dev
```

The exporter is generic OTLP. Langfuse, Braintrust, Jaeger, Grafana Tempo and
anything else OTLP-shaped all work without code changes — the hosting decision
is deliberately deferred until the pilot has measured real trace volume.

### Content capture is opt-in

Prompts embed ticket bodies from untrusted webhook senders and completions
embed repository source. Enabling
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` ships that content to
whatever backend is configured. Spans otherwise carry a SHA-256 prompt hash
and a character count, which answers "was this the same prompt" without
exfiltrating it.

## Trace shape

```
HTTP POST /api/tickets/:id/run          SERVER    (backend)
└── job.dispatch                        INTERNAL  ← traceparent injected here
    └── worker.invoke                   PRODUCER
        ╎ (process boundary — W3C carrier in the bootstrap payload)
        └── job.execute                 CONSUMER  (worker root)
            ├── git.clone
            ├── instructions.materialize
            ├── agent.execute <agent>   INTERNAL  selection + auth retry
            │   └── invoke_agent <agent> CLIENT   ← GenAI span: model, usage, cost
            ├── git.commit
            ├── git.push
            └── scm.create_pull_request CLIENT
```

`invoke_agent` is the only span carrying `gen_ai.operation.name`. The
orchestration span above it deliberately does not, so per-operation aggregates
do not double-count a single agent invocation.

## Attributes

GenAI attributes are pinned literals in `semconv.ts`, and `semconv.test.ts`
asserts each one still equals the constant exported by
`@opentelemetry/semantic-conventions@1.43.0`. **Bumping that dependency
without reviewing the diff fails the test rather than rewriting history.**
`GENAI_SEMCONV_REVISION` is stamped on every span and on the resource.

Domain attributes the spec has no name for are prefixed `vg.` (see
`attributes.ts`). Three carry meaning worth stating explicitly:

- `vg.usage.available` — `false` when the CLI reported no token usage.
  Distinct from zero tokens and from "not instrumented".
- `vg.cost.provenance` — `actual` (CLI-reported), `estimated` (the plugin's
  `costPerExecution` constant) or `unavailable`.
- `vg.semconv.revision` — the convention revision the span was produced under.

Today only the Claude Code agent reports real usage, parsed from its
`--output-format=stream-json` result event. The other seven record
`usageAvailable: false` and `costProvenance: "estimated"`. That is the
intended state, not an oversight: inventing numbers for CLIs that do not
expose them would poison the corpus.

## Verifying the export pipeline

Unit tests cover configuration, propagation, span semantics and the pinned
attribute names. They cannot cover the OTLP export itself: the exporter
resolves its HTTP transport through a dynamic import, which Jest's CommonJS VM
refuses without `--experimental-vm-modules`.

So the export path has its own check, run outside Jest:

```bash
# against any OTLP/HTTP collector
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  npm run smoke:export -w @viberglass/telemetry

# no collector to hand — prints the spans instead
VIBERGLASS_OTEL_CONSOLE=true npm run smoke:export -w @viberglass/telemetry
```

It emits `job.dispatch → job.execute → invoke_agent`, passing the trace
context between the first and second through a serialized carrier exactly as
the bootstrap payload does. All three spans must arrive with the same trace id
and correct parenting; if the carrier is broken they arrive as two traces.

## Context propagation

`injectTraceContext()` returns a `{traceparent, tracestate}` carrier;
`withRemoteTraceContext(carrier, fn)` runs `fn` under it. The carrier is added
to the bootstrap payload under the `telemetry` key, which is **persisted** —
ECS and Docker workers launched with `--job-ref` re-fetch the stored payload,
so a carrier attached only to the in-memory copy would never reach them.

A missing or malformed carrier is not an error: the worker starts its own
trace. Payloads written before this existed still run.

## Flushing

Spans are batched. Both worker entrypoints exit the process as soon as the
result callback returns, so they must flush first:

- CLI/ECS/Docker: `shutdownTelemetryAndExit(code)` — flush, shut down, exit.
- Lambda: `flushTelemetryBeforeFreeze()` — flush only; the frozen container is
  reused, so the provider must survive.
- Backend: flushed in the `SIGTERM`/`SIGINT` handler.

All are bounded — a wedged collector must not stop a finished worker exiting.

## Known gaps

- **No auto-instrumentation.** Both apps are ESM (`"type": "module"`), and the
  OTel auto-instrumentations patch CommonJS via require-in-the-middle, so they
  need an `--import` loader hook rather than an in-process call. Enabling them
  means adding a register script to the backend start command and to all three
  worker Dockerfiles. Consequence today: no automatic spans for outbound HTTP,
  `pg` queries or Express internals. The HTTP server span is hand-rolled in
  `apps/platform-backend/src/api/middleware/tracing.ts`.
- **ACP session turns are not covered by the GenAI span.** Interactive turns
  run through `AcpExecutor`, not `BaseAgent.execute`, so they get the job and
  orchestration spans but no `invoke_agent` span with model and usage.
- **Usage parsing exists for Claude Code only** (see above).
- **Replayed payloads join old traces.** A job re-dispatched from a stored
  bootstrap payload reuses its original `traceparent`.
