import type { WorkerModelEndpoint } from "@viberglass/types";
import { vibeModelEndpointEnvironment } from "../src/vibeModelConfig";

const endpoint: WorkerModelEndpoint = {
  name: "EU models",
  baseUrl: "https://models.example.com/v1",
  apiFormat: "openai-chat",
  auth: { scheme: "bearer" },
  extraHeaders: { "X-Team": "eu" },
  model: "qwen",
  mayColdStart: false,
};
const env = { MODEL_ENDPOINT_API_KEY: "secret" };

function providers(value: NodeJS.ProcessEnv) {
  return JSON.parse(value.VIBE_PROVIDERS ?? "[]");
}

describe("Vibe model endpoint", () => {
  test("reads a bearer key for OpenAI-style APIs from the environment", () => {
    const result = vibeModelEndpointEnvironment(endpoint, env);
    expect(providers(result)).toEqual([
      {
        name: "viberglass",
        api_base: "https://models.example.com/v1",
        api_style: "openai",
        api_key_env_var: "MODEL_ENDPOINT_API_KEY",
        extra_headers: { "X-Team": "eu" },
      },
    ]);
    expect(JSON.parse(result.VIBE_MODELS ?? "")).toEqual([
      { name: "qwen", provider: "viberglass", alias: "viberglass", max_context_length: 32768 },
    ]);
    expect(result.VIBE_ACTIVE_MODEL).toBe("viberglass");
    expect(result.VIBE_ENABLE_TELEMETRY).toBe("false");
  });

  test("puts a custom header key into the provider's headers", () => {
    const [provider] = providers(
      vibeModelEndpointEnvironment({ ...endpoint, auth: { scheme: "header", header: "api-key" } }, env),
    );
    expect(provider).toMatchObject({
      api_style: "openai",
      api_key_env_var: "",
      extra_headers: { "X-Team": "eu", "api-key": "secret" },
    });
  });

  test("reads an Anthropic x-api-key from the environment", () => {
    const [provider] = providers(
      vibeModelEndpointEnvironment(
        { ...endpoint, apiFormat: "anthropic-messages", auth: { scheme: "header", header: "x-api-key" } },
        env,
      ),
    );
    expect(provider).toMatchObject({
      api_style: "anthropic",
      api_key_env_var: "MODEL_ENDPOINT_API_KEY",
      extra_headers: { "X-Team": "eu" },
    });
  });

  test("sends an Anthropic bearer key as a header, and nothing for an open endpoint", () => {
    const [anthropic] = providers(vibeModelEndpointEnvironment({ ...endpoint, apiFormat: "anthropic-messages" }, env));
    expect(anthropic.extra_headers.Authorization).toBe("Bearer secret");
    const [open] = providers(vibeModelEndpointEnvironment({ ...endpoint, auth: { scheme: "none" } }, {}));
    expect(open).toMatchObject({ api_key_env_var: "", extra_headers: { "X-Team": "eu" } });
  });
});
