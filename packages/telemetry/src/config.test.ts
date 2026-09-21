import {
  parseOtlpHeaders,
  resolveTelemetryConfig,
  resolveTracesEndpoint,
} from "./config";

describe("resolveTracesEndpoint", () => {
  it("returns undefined when nothing is configured", () => {
    expect(resolveTracesEndpoint({})).toBeUndefined();
  });

  it("appends the traces signal path to the generic endpoint", () => {
    expect(
      resolveTracesEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" }),
    ).toBe("http://collector:4318/v1/traces");
  });

  it("does not double up the slash on a trailing-slash endpoint", () => {
    expect(
      resolveTracesEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318/" }),
    ).toBe("http://collector:4318/v1/traces");
  });

  it("uses the signal-specific endpoint verbatim", () => {
    expect(
      resolveTracesEndpoint({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://generic:4318",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://cloud.example/api/traces",
      }),
    ).toBe("https://cloud.example/api/traces");
  });
});

describe("parseOtlpHeaders", () => {
  it("returns an empty object when unset", () => {
    expect(parseOtlpHeaders(undefined)).toEqual({});
  });

  it("parses comma separated pairs", () => {
    expect(parseOtlpHeaders("api-key=abc,x-scope=team")).toEqual({
      "api-key": "abc",
      "x-scope": "team",
    });
  });

  it("keeps '=' inside a value — Basic auth headers end in padding", () => {
    expect(parseOtlpHeaders("authorization=Basic cGs6c2s=")).toEqual({
      authorization: "Basic cGs6c2s=",
    });
  });

  it("percent-decodes values", () => {
    expect(parseOtlpHeaders("authorization=Bearer%20token")).toEqual({
      authorization: "Bearer token",
    });
  });
});

describe("resolveTelemetryConfig", () => {
  it("is disabled when no exporter is configured", () => {
    expect(resolveTelemetryConfig({}, {}).enabled).toBe(false);
  });

  it("is enabled by an OTLP endpoint", () => {
    const config = resolveTelemetryConfig(
      {},
      { OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" },
    );
    expect(config.enabled).toBe(true);
  });

  it("is enabled by the console exporter alone", () => {
    expect(
      resolveTelemetryConfig({}, { VIBERGLASS_OTEL_CONSOLE: "true" }).enabled,
    ).toBe(true);
  });

  it("honours OTEL_SDK_DISABLED over a configured endpoint", () => {
    const config = resolveTelemetryConfig(
      {},
      {
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
        OTEL_SDK_DISABLED: "true",
      },
    );
    expect(config.enabled).toBe(false);
  });

  it("prefers OTEL_SERVICE_NAME over the caller's default", () => {
    const config = resolveTelemetryConfig(
      { serviceName: "viberglass-backend" },
      { OTEL_SERVICE_NAME: "backend-canary" },
    );
    expect(config.serviceName).toBe("backend-canary");
  });

  it("does not capture prompt or completion content by default", () => {
    expect(resolveTelemetryConfig({}, {}).captureMessageContent).toBe(false);
  });

  it("captures content only on the spec's explicit opt-in", () => {
    const config = resolveTelemetryConfig(
      {},
      { OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: "true" },
    );
    expect(config.captureMessageContent).toBe(true);
  });

  it("falls back to full sampling on an out-of-range ratio", () => {
    expect(resolveTelemetryConfig({}, { OTEL_TRACES_SAMPLER_ARG: "7" }).sampleRatio).toBe(1);
    expect(
      resolveTelemetryConfig({}, { OTEL_TRACES_SAMPLER_ARG: "0.25" }).sampleRatio,
    ).toBe(0.25);
  });
});
