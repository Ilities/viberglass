import { SpanStatusCode } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";

import { ATTR_VG_SEMCONV_REVISION, GENAI_SEMCONV_REVISION } from "./semconv";
import { activeTraceIds, definedAttributes, markSpanFailed, withSpan } from "./spans";
import { resetTelemetryForTesting } from "./tracing";

const exporter = new InMemorySpanExporter();
let provider: NodeTracerProvider;

beforeAll(() => {
  provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
});

afterAll(async () => {
  await provider.shutdown();
  resetTelemetryForTesting();
});

beforeEach(() => exporter.reset());

describe("definedAttributes", () => {
  it("drops undefined and null but keeps falsy values", () => {
    expect(
      definedAttributes({
        a: 0,
        b: false,
        c: "",
        d: undefined,
        e: null,
      }),
    ).toEqual({ a: 0, b: false, c: "" });
  });
});

describe("withSpan", () => {
  it("records the pinned convention revision on every span", async () => {
    await withSpan("job.execute", {}, async () => undefined);
    expect(exporter.getFinishedSpans()[0].attributes[ATTR_VG_SEMCONV_REVISION]).toBe(
      GENAI_SEMCONV_REVISION,
    );
  });

  it("leaves the status unset on success", async () => {
    await withSpan("job.execute", {}, async () => "ok");
    expect(exporter.getFinishedSpans()[0].status.code).toBe(SpanStatusCode.UNSET);
  });

  it("returns the callback's value", async () => {
    await expect(withSpan("job.execute", {}, async () => 42)).resolves.toBe(42);
  });

  it("records the exception, marks ERROR, and re-throws", async () => {
    const boom = new Error("clone failed");
    await expect(
      withSpan("git.clone", {}, async () => {
        throw boom;
      }),
    ).rejects.toThrow("clone failed");

    const span = exporter.getFinishedSpans()[0];
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBe("clone failed");
    expect(span.events.map((event) => event.name)).toContain("exception");
  });

  it("ends the span even when the callback throws a non-Error", async () => {
    await expect(
      withSpan("git.clone", {}, async () => {
        throw "string failure";
      }),
    ).rejects.toBe("string failure");
    expect(exporter.getFinishedSpans()).toHaveLength(1);
    expect(exporter.getFinishedSpans()[0].ended).toBe(true);
  });

  it("lets a caller fail a span that did not throw", async () => {
    // Agent runs report failure as data, not exceptions.
    await withSpan("agent.execute", {}, async (span) => {
      markSpanFailed(span, "agent exited non-zero");
    });
    expect(exporter.getFinishedSpans()[0].status.code).toBe(SpanStatusCode.ERROR);
  });
});

describe("activeTraceIds", () => {
  it("is undefined outside a span", () => {
    expect(activeTraceIds()).toBeUndefined();
  });

  it("exposes the ids of the active span for log correlation", async () => {
    const ids = await withSpan("job.execute", {}, async () => activeTraceIds());
    expect(ids?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ids?.spanId).toMatch(/^[0-9a-f]{16}$/);
  });
});
