/**
 * Telemetry configuration, resolved from the environment.
 *
 * Standard `OTEL_*` variables are honoured where they exist so the deployment
 * looks like any other OTLP producer; `VIBERGLASS_OTEL_*` only covers what the
 * spec has no variable for.
 */

export interface TelemetryConfig {
  /** False means every export path is skipped and the no-op tracer is used. */
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  deploymentEnvironment: string;
  /** OTLP/HTTP traces endpoint, already resolved to a full signal URL. */
  otlpEndpoint?: string;
  otlpHeaders: Record<string, string>;
  /** Print spans to stdout — local development and CI assertions. */
  consoleExporter: boolean;
  /**
   * Whether to attach prompts and completions to spans.
   *
   * Off by default. Prompts here contain ticket bodies from untrusted webhook
   * senders and completions contain repository source, so turning this on ships
   * customer content to whatever backend is configured. The spec's own
   * opt-in variable governs it.
   */
  captureMessageContent: boolean;
  /** Head sampling ratio, 0..1. */
  sampleRatio: number;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

function readRatio(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}

/**
 * Parses `OTEL_EXPORTER_OTLP_HEADERS` (W3C Baggage style: `k1=v1,k2=v2`).
 *
 * Values are percent-decoded per the OTLP exporter spec — auth headers
 * routinely contain `=` and other reserved characters.
 */
export function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const headers: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key) continue;
    try {
      headers[key] = decodeURIComponent(value);
    } catch {
      headers[key] = value;
    }
  }
  return headers;
}

/**
 * Resolves the traces endpoint.
 *
 * `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is used verbatim; the generic
 * `OTEL_EXPORTER_OTLP_ENDPOINT` gets `/v1/traces` appended, per the OTLP
 * exporter specification.
 */
export function resolveTracesEndpoint(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const signalSpecific = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (signalSpecific) return signalSpecific;

  const generic = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!generic) return undefined;

  return `${generic.replace(/\/+$/, "")}/v1/traces`;
}

export interface TelemetryConfigOverrides {
  serviceName?: string;
  serviceVersion?: string;
}

export function resolveTelemetryConfig(
  overrides: TelemetryConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): TelemetryConfig {
  const otlpEndpoint = resolveTracesEndpoint(env);
  const consoleExporter = readBool(env.VIBERGLASS_OTEL_CONSOLE, false);

  // Nothing to export to and nothing to print — stay a no-op rather than
  // standing up a provider and a batch processor that drop every span.
  const sdkDisabled = readBool(env.OTEL_SDK_DISABLED, false);
  const enabled = !sdkDisabled && (Boolean(otlpEndpoint) || consoleExporter);

  return {
    enabled,
    serviceName:
      env.OTEL_SERVICE_NAME?.trim() ||
      overrides.serviceName ||
      "viberglass-unknown",
    serviceVersion:
      overrides.serviceVersion || env.VIBERGLASS_VERSION?.trim() || "0.0.0",
    deploymentEnvironment:
      env.VIBERGLASS_DEPLOYMENT_ENV?.trim() ||
      env.NODE_ENV?.trim() ||
      "development",
    otlpEndpoint,
    otlpHeaders: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    consoleExporter,
    captureMessageContent: readBool(
      env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT,
      false,
    ),
    sampleRatio: readRatio(env.OTEL_TRACES_SAMPLER_ARG, 1),
  };
}
