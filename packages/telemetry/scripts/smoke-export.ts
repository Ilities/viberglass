/**
 * End-to-end check of the export pipeline, outside Jest.
 *
 * Covers the two things the unit tests cannot:
 *
 *  1. The OTLP exporter resolves its HTTP transport through a dynamic import,
 *     which Jest's CommonJS VM refuses without --experimental-vm-modules. So
 *     `flush` is never exercised there.
 *  2. Whether a serialized trace carrier really reparents spans across a
 *     process boundary is only observable in what the collector receives.
 *
 * Usage:
 *   # against any OTLP/HTTP collector
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
 *     npm run smoke:export -w @viberglass/telemetry
 *
 *   # no collector to hand — prints the spans to stdout instead
 *   VIBERGLASS_OTEL_CONSOLE=true npm run smoke:export -w @viberglass/telemetry
 *
 * Exits non-zero if tracing is not configured or a span fails to start.
 */
import { injectTraceContext, withRemoteTraceContext } from "../src/propagation";
import { withSpan } from "../src/spans";
import {
  flushTelemetry,
  shutdownTelemetry,
  startTelemetry,
} from "../src/tracing";

async function main(): Promise<void> {
  const handle = startTelemetry({
    serviceName: "viberglass-telemetry-smoke",
    serviceVersion: "0.0.0-smoke",
  });

  if (!handle.enabled) {
    console.error(
      "Tracing is disabled. Set OTEL_EXPORTER_OTLP_ENDPOINT or VIBERGLASS_OTEL_CONSOLE=true.",
    );
    process.exit(1);
  }

  console.log(
    `exporting to ${handle.config.otlpEndpoint ?? "(console)"} as ${handle.config.serviceName}`,
  );

  // Backend side: open the dispatch span and serialise its context, exactly
  // as the bootstrap payload does.
  const carrier = await withSpan("job.dispatch", {}, async () =>
    injectTraceContext(),
  );

  if (!carrier) {
    console.error("No trace carrier produced — propagation is broken.");
    process.exit(1);
  }
  console.log(`carrier: ${carrier.traceparent}`);

  // Worker side: rehydrate and run the job spans beneath it.
  await withRemoteTraceContext(carrier, () =>
    withSpan(
      "job.execute",
      { attributes: { "vg.job.id": "smoke-job" } },
      async () =>
        withSpan(
          "invoke_agent smoke-agent",
          {
            attributes: {
              "gen_ai.operation.name": "invoke_agent",
              "gen_ai.agent.name": "smoke-agent",
              "vg.usage.available": false,
              "vg.cost.provenance": "unavailable",
            },
          },
          async () => undefined,
        ),
    ),
  );

  await flushTelemetry();
  await shutdownTelemetry();

  console.log(
    "exported job.dispatch → job.execute → invoke_agent; all three should share one trace id",
  );
}

main().catch((error: unknown) => {
  console.error("smoke export failed:", error);
  process.exit(1);
});
