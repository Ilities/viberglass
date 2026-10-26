import { OpenCodeModelEndpointEnvironment } from "../src/OpenCodeModelEndpointEnvironment";
import type { ModelEndpointAuth } from "@viberglass/types";

test.each([
  "https://api.anthropic.com",
  "https://api.anthropic.com/v1/",
  "https://proxy.example.com/anthropic/",
])("generates an Anthropic provider with a versioned URL for %s", (baseUrl) => {
  const env = new OpenCodeModelEndpointEnvironment({
    name: "Anthropic",
    baseUrl,
    apiFormat: "anthropic-messages",
    auth: { scheme: "header", header: "x-api-key" },
    extraHeaders: { "X-Team": "eu" },
    model: "claude-sonnet-4-5",
    mayColdStart: false,
    contextWindow: 200000,
  }).resolve();
  expect(env.OPENCODE_MODEL).toBe("viberglass/claude-sonnet-4-5");
  expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT)).toEqual({
    model: "viberglass/claude-sonnet-4-5",
    small_model: "viberglass/claude-sonnet-4-5",
    provider: {
      viberglass: {
        npm: "@ai-sdk/anthropic",
        name: "Anthropic",
        options: {
          baseURL: `${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
          apiKey: "",
          headers: { "X-Team": "eu", "x-api-key": "{env:MODEL_ENDPOINT_API_KEY}" },
        },
        models: {
          "claude-sonnet-4-5": { name: "claude-sonnet-4-5", limit: { context: 200000, output: 32000 } },
        },
      },
    },
  });
});

const authCases: Array<{ auth: ModelEndpointAuth; headers: Record<string, string> }> = [
  { auth: { scheme: "bearer" }, headers: { Authorization: "Bearer {env:MODEL_ENDPOINT_API_KEY}" } },
  { auth: { scheme: "header", header: "X-Proxy-Key" }, headers: { "X-Proxy-Key": "{env:MODEL_ENDPOINT_API_KEY}" } },
  { auth: { scheme: "none" }, headers: {} },
];

test.each(authCases)("Anthropic endpoints use configured $auth.scheme auth without an ambient API key", ({ auth, headers }) => {
  const env = new OpenCodeModelEndpointEnvironment({
    name: "Proxy", baseUrl: "https://proxy.example.com", apiFormat: "anthropic-messages",
    auth, extraHeaders: {}, model: "claude", mayColdStart: false,
  }).resolve();
  expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT).provider.viberglass.options).toEqual({
    baseURL: "https://proxy.example.com/v1", apiKey: "", headers,
  });
});

test("generates an OpenAI-compatible provider with model and env-referenced headers", () => {
  const env = new OpenCodeModelEndpointEnvironment({
    name: "EU models",
    baseUrl: "https://eu.example.com/v1",
    apiFormat: "openai-chat",
    auth: { scheme: "bearer" },
    extraHeaders: { "X-Team": "eu" },
    model: "org/qwen",
    mayColdStart: false,
    contextWindow: 32768,
  }).resolve();
  expect(env.OPENCODE_MODEL).toBe("viberglass/org/qwen");
  expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT)).toEqual({
    model: "viberglass/org/qwen",
    small_model: "viberglass/org/qwen",
    provider: {
      viberglass: {
        npm: "@ai-sdk/openai-compatible",
        name: "EU models",
        options: {
          baseURL: "https://eu.example.com/v1",
          headers: {
            "X-Team": "eu",
            Authorization: "Bearer {env:MODEL_ENDPOINT_API_KEY}",
          },
        },
        models: {
          "org/qwen": {
            name: "org/qwen",
            limit: { context: 32768, output: 8192 },
          },
        },
      },
    },
  });
});

test("anonymous endpoints send no auth header", () => {
  const env = new OpenCodeModelEndpointEnvironment({
    name: "Local",
    baseUrl: "http://models/v1",
    apiFormat: "openai-chat",
    auth: { scheme: "none" },
    extraHeaders: {},
    model: "qwen",
    mayColdStart: false,
  }).resolve();
  expect(
    JSON.parse(env.OPENCODE_CONFIG_CONTENT).provider.viberglass.options.headers,
  ).toEqual({});
});

test("leaves the limits to OpenCode when the model's context length isn't known", () => {
  const env = new OpenCodeModelEndpointEnvironment({
    name: "Hosted",
    baseUrl: "https://api.example.com/v1",
    apiFormat: "openai-chat",
    auth: { scheme: "bearer" },
    extraHeaders: {},
    model: "big",
    mayColdStart: false,
  }).resolve();
  expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT).provider.viberglass.models.big).toEqual({ name: "big" });
});
