import { OpenCodeModelEndpointEnvironment } from "../src/OpenCodeModelEndpointEnvironment";

test("generates an OpenAI-compatible provider with model and env-referenced headers", () => {
  const env = new OpenCodeModelEndpointEnvironment({
    name: "EU models",
    baseUrl: "https://eu.example.com/v1",
    apiFormat: "openai-chat",
    auth: { scheme: "bearer" },
    extraHeaders: { "X-Team": "eu" },
    model: "org/qwen",
    mayColdStart: false,
  }).resolve();
  expect(env.OPENCODE_MODEL).toBe("viberglass/org/qwen");
  expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT)).toEqual({
    model: "viberglass/org/qwen",
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
