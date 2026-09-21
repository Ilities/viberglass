/**
 * Telemetry bootstrap for the platform backend.
 *
 * Imported for its side effect as the first import in `api/server.ts`, so the
 * tracer provider is registered before anything that might open a span.
 */
import { startTelemetry } from "@viberglass/telemetry";

import logger from "./logger";

export const telemetry = startTelemetry({
  serviceName: "viberglass-platform-backend",
  serviceVersion: process.env.VIBERGLASS_VERSION || "0.0.0",
});

if (telemetry.enabled) {
  logger.info("OpenTelemetry tracing enabled", {
    service: telemetry.config.serviceName,
    endpoint: telemetry.config.otlpEndpoint ?? "(console only)",
    environment: telemetry.config.deploymentEnvironment,
    sampleRatio: telemetry.config.sampleRatio,
  });
} else {
  logger.debug(
    "OpenTelemetry tracing disabled — set OTEL_EXPORTER_OTLP_ENDPOINT or VIBERGLASS_OTEL_CONSOLE=true to enable",
  );
}
