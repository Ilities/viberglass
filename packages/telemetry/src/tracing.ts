import { diag, DiagConsoleLogger, DiagLogLevel, trace, type Tracer } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  NodeTracerProvider,
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

import {
  resolveTelemetryConfig,
  type TelemetryConfig,
  type TelemetryConfigOverrides,
} from "./config";
import { ATTR_VG_SEMCONV_REVISION, GENAI_SEMCONV_REVISION } from "./semconv";

export const TRACER_NAME = "@viberglass/telemetry";

export interface TelemetryHandle {
  /** False when no exporter was configured — spans go to the API's no-op tracer. */
  readonly enabled: boolean;
  readonly config: TelemetryConfig;
  /** Flush pending spans without tearing the provider down. */
  forceFlush(): Promise<void>;
  /** Flush and shut down. Safe to call more than once. */
  shutdown(): Promise<void>;
}

const DISABLED_HANDLE_METHODS = {
  forceFlush: async (): Promise<void> => {},
  shutdown: async (): Promise<void> => {},
};

let handle: TelemetryHandle | undefined;

/**
 * Starts tracing for the current process. Idempotent — later calls return the
 * handle from the first, because both entrypoint modules and tests can reach
 * this and registering two global providers silently drops one's spans.
 *
 * Instrumentation is entirely manual. Both `platform-backend` and `viberator`
 * are ESM (`"type": "module"`), and OpenTelemetry's auto-instrumentations patch
 * CommonJS via require-in-the-middle, so they need an ESM loader hook
 * (`--import`) rather than an in-process call. Wiring the loader into the
 * Lambda, ECS and Docker entrypoints is deferred; see README.md. What Phase 0
 * needs is lifecycle and GenAI spans, and those are hand-written anyway.
 */
export function startTelemetry(
  overrides: TelemetryConfigOverrides = {},
): TelemetryHandle {
  if (handle) return handle;

  const config = resolveTelemetryConfig(overrides);

  if (!config.enabled) {
    handle = { enabled: false, config, ...DISABLED_HANDLE_METHODS };
    return handle;
  }

  if (process.env.OTEL_LOG_LEVEL) {
    diag.setLogger(new DiagConsoleLogger(), toDiagLogLevel(process.env.OTEL_LOG_LEVEL));
  }

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.deploymentEnvironment,
      // Stamped on the resource as well as on spans so a whole service's
      // traces can be filtered by convention revision after a pin bump.
      [ATTR_VG_SEMCONV_REVISION]: GENAI_SEMCONV_REVISION,
    }),
  );

  const spanProcessors: SpanProcessor[] = [];

  if (config.otlpEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: config.otlpEndpoint,
          headers: config.otlpHeaders,
        }),
      ),
    );
  }

  if (config.consoleExporter) {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  const provider = new NodeTracerProvider({
    resource,
    spanProcessors,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(config.sampleRatio),
    }),
  });

  // Explicit W3C propagator: the worker joins the backend's trace through a
  // `traceparent` carried in the bootstrap payload, so trace context must be
  // encoded the same way on both sides regardless of OTEL_PROPAGATORS.
  provider.register({ propagator: new W3CTraceContextPropagator() });

  let shutdownPromise: Promise<void> | undefined;

  handle = {
    enabled: true,
    config,
    forceFlush: () => provider.forceFlush(),
    shutdown: () => {
      shutdownPromise ??= provider.shutdown();
      return shutdownPromise;
    },
  };

  return handle;
}

/** The handle from {@link startTelemetry}, or undefined if never started. */
export function getTelemetryHandle(): TelemetryHandle | undefined {
  return handle;
}

/**
 * Flushes pending spans. Call before `process.exit()`.
 *
 * `BatchSpanProcessor` buffers, and the worker entrypoints call `process.exit`
 * with the job's exit code the moment the result callback returns — without
 * this, the spans for a completed job are discarded, which is precisely the
 * job whose trace matters most.
 */
export async function flushTelemetry(): Promise<void> {
  await handle?.forceFlush();
}

export async function shutdownTelemetry(): Promise<void> {
  await handle?.shutdown();
  handle = undefined;
}

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME, GENAI_SEMCONV_REVISION);
}

/** Test seam — drops the module-level handle without touching the global provider. */
export function resetTelemetryForTesting(): void {
  handle = undefined;
}

function toDiagLogLevel(raw: string): DiagLogLevel {
  switch (raw.trim().toUpperCase()) {
    case "NONE":
      return DiagLogLevel.NONE;
    case "ERROR":
      return DiagLogLevel.ERROR;
    case "WARN":
      return DiagLogLevel.WARN;
    case "INFO":
      return DiagLogLevel.INFO;
    case "DEBUG":
      return DiagLogLevel.DEBUG;
    case "VERBOSE":
    case "ALL":
      return DiagLogLevel.ALL;
    default:
      return DiagLogLevel.INFO;
  }
}
