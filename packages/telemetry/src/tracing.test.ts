/**
 * Exercises the real bootstrap path.
 *
 * The other suites build a NodeTracerProvider directly, which would not catch
 * a mistake in how `startTelemetry` constructs and registers one — and that is
 * the function every process actually calls.
 *
 * Own file because it registers a global tracer provider; Jest gives each test
 * file a fresh module registry, so this cannot leak into the other suites.
 */
import { trace } from "@opentelemetry/api";

import {
  flushTelemetry,
  getTelemetryHandle,
  getTracer,
  resetTelemetryForTesting,
  shutdownTelemetry,
  startTelemetry,
} from "./tracing";

const ORIGINAL_ENV = process.env;

afterEach(async () => {
  // Shutdown flushes, and flushing a span through the OTLP exporter fails
  // under Jest's CommonJS VM (see the OTLP test below). Teardown must survive
  // that, or the module-level handle leaks into the next test and every
  // subsequent assertion is measuring the previous test's provider.
  try {
    await shutdownTelemetry();
  } catch {
    // Exporter transport cannot load here; nothing to clean up beyond the reset.
  }
  resetTelemetryForTesting();
  process.env = ORIGINAL_ENV;
});

describe("startTelemetry", () => {
  it("is a no-op when nothing is configured", async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    delete process.env.VIBERGLASS_OTEL_CONSOLE;

    const handle = startTelemetry({ serviceName: "test-service" });

    expect(handle.enabled).toBe(false);
    // Must still be callable — callers should not have to branch on enabled.
    await expect(handle.forceFlush()).resolves.toBeUndefined();
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });

  it("starts a working provider when an OTLP endpoint is set", () => {
    process.env = {
      ...ORIGINAL_ENV,
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
    };

    const handle = startTelemetry({ serviceName: "test-service" });

    expect(handle.enabled).toBe(true);
    expect(handle.config.otlpEndpoint).toBe("http://127.0.0.1:4318/v1/traces");

    // Spans become real rather than no-ops — the provider registered.
    const span = getTracer().startSpan("smoke");
    expect(trace.isSpanContextValid(span.spanContext())).toBe(true);
    span.end();

    // Deliberately not asserting on flush here: the OTLP exporter resolves
    // its HTTP transport through a dynamic import, which Jest's CommonJS VM
    // refuses without --experimental-vm-modules. Turning that flag on for the
    // whole package to test one line is a poor trade. The export path is
    // covered outside Jest instead — see packages/telemetry/README.md.
  });

  it("returns the same handle on repeated calls", () => {
    process.env = { ...ORIGINAL_ENV, VIBERGLASS_OTEL_CONSOLE: "true" };

    // Both entrypoint modules and tests can reach this, and registering two
    // global providers silently drops one's spans.
    const first = startTelemetry({ serviceName: "a" });
    const second = startTelemetry({ serviceName: "b" });

    expect(second).toBe(first);
    expect(second.config.serviceName).toBe("a");
    expect(getTelemetryHandle()).toBe(first);
  });

  it("tolerates shutdown being called twice", async () => {
    // Console exporter, so shutdown genuinely completes rather than tripping
    // over the OTLP transport's dynamic import.
    process.env = { ...ORIGINAL_ENV, VIBERGLASS_OTEL_CONSOLE: "true" };
    const handle = startTelemetry({ serviceName: "test-service" });

    await expect(handle.shutdown()).resolves.toBeUndefined();
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });

  it("flushing before start does nothing rather than throwing", async () => {
    await expect(flushTelemetry()).resolves.toBeUndefined();
  });
});
