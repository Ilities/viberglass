/**
 * The backend and the worker are separate processes with no HTTP call between
 * them — the worker is invoked via Lambda/ECS/Docker and receives a JSON
 * bootstrap payload. These tests stand in for that boundary: inject on one
 * side, extract on the other, and assert the worker's spans land in the
 * backend's trace rather than starting a second, orphaned one.
 */
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";

import { extractTraceContext, injectTraceContext, withRemoteTraceContext } from "./propagation";
import { withSpan } from "./spans";
import { resetTelemetryForTesting } from "./tracing";

const exporter = new InMemorySpanExporter();
let provider: NodeTracerProvider;

beforeAll(() => {
  provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });
});

afterAll(async () => {
  await provider.shutdown();
  resetTelemetryForTesting();
});

beforeEach(() => exporter.reset());

describe("injectTraceContext", () => {
  it("returns undefined outside any span", () => {
    expect(injectTraceContext()).toBeUndefined();
  });

  it("produces a W3C traceparent inside a span", async () => {
    const carrier = await withSpan("dispatch", {}, async () => injectTraceContext());
    expect(carrier?.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });
});

describe("extractTraceContext", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "00-abc-def-01"],
    ["an empty object", {}],
    ["a malformed traceparent", { traceparent: "not-a-traceparent" }],
    ["an all-zero trace id", { traceparent: `00-${"0".repeat(32)}-${"0".repeat(16)}-01` }],
  ])("falls back to the active context for %s", (_label, carrier) => {
    // A worker started from a payload predating this field, or replayed by a
    // tool that does not set it, must still run.
    expect(() => extractTraceContext(carrier)).not.toThrow();
    expect(extractTraceContext(carrier)).toBeDefined();
  });
});

describe("backend to worker propagation", () => {
  it("puts the worker span in the backend's trace", async () => {
    // Backend process: open the dispatch span, serialise its context.
    const carrier = await withSpan("job.dispatch", {}, async () =>
      injectTraceContext(),
    );
    expect(carrier).toBeDefined();

    // Worker process: rehydrate and open the execution span under it.
    await withRemoteTraceContext(carrier, () =>
      withSpan("job.execute", {}, async () => undefined),
    );

    const spans = exporter.getFinishedSpans();
    const dispatch = spans.find((span) => span.name === "job.dispatch");
    const execute = spans.find((span) => span.name === "job.execute");

    expect(dispatch).toBeDefined();
    expect(execute).toBeDefined();
    expect(execute!.spanContext().traceId).toBe(dispatch!.spanContext().traceId);
    expect(execute!.parentSpanContext?.spanId).toBe(dispatch!.spanContext().spanId);
  });

  it("starts a fresh trace when no carrier was propagated", async () => {
    await withSpan("job.dispatch", {}, async () => undefined);
    await withRemoteTraceContext(undefined, () =>
      withSpan("job.execute", {}, async () => undefined),
    );

    const spans = exporter.getFinishedSpans();
    const dispatch = spans.find((span) => span.name === "job.dispatch")!;
    const execute = spans.find((span) => span.name === "job.execute")!;

    expect(execute.spanContext().traceId).not.toBe(dispatch.spanContext().traceId);
    expect(execute.parentSpanContext).toBeUndefined();
  });
});
