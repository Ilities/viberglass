import type { WorkerModelEndpoint } from "@viberglass/types";
import { claudeModelEndpointEnvironment } from "../src/claudeModelEndpoint";

const endpoint: WorkerModelEndpoint = {
  name: "GLM",
  baseUrl: "https://api.example.com/anthropic",
  apiFormat: "anthropic-messages",
  auth: { scheme: "bearer" },
  extraHeaders: { "X-Team": "eu" },
  model: "glm-5",
  mayColdStart: false,
};
const env = { MODEL_ENDPOINT_API_KEY: "secret" };

describe("Claude Code model endpoint", () => {
  test("sends a bearer key as the auth token and uses the model for every role", () => {
    const result = claudeModelEndpointEnvironment(endpoint, env);
    expect(result).toMatchObject({
      ANTHROPIC_BASE_URL: "https://api.example.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: "secret",
      ANTHROPIC_CUSTOM_HEADERS: "X-Team: eu",
      ANTHROPIC_MODEL: "glm-5",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-5",
      ANTHROPIC_SMALL_FAST_MODEL: "glm-5",
      CLAUDE_CODE_SUBAGENT_MODEL: "glm-5",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    });
    expect("ANTHROPIC_API_KEY" in result && result.ANTHROPIC_API_KEY === undefined).toBe(true);
  });

  test("sends an x-api-key header without a token", () => {
    const result = claudeModelEndpointEnvironment(
      { ...endpoint, extraHeaders: {}, auth: { scheme: "header", header: "x-api-key" } },
      env,
    );
    expect(result.ANTHROPIC_CUSTOM_HEADERS).toBe("x-api-key: secret");
    expect(result.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  test("adds a placeholder token beside other headers and for open endpoints", () => {
    const custom = claudeModelEndpointEnvironment({ ...endpoint, auth: { scheme: "header", header: "api-key" } }, env);
    expect(custom.ANTHROPIC_CUSTOM_HEADERS).toBe("X-Team: eu\napi-key: secret");
    expect(custom.ANTHROPIC_AUTH_TOKEN).toBe("unused");
    const open = claudeModelEndpointEnvironment({ ...endpoint, extraHeaders: {}, auth: { scheme: "none" } }, {});
    expect(open.ANTHROPIC_AUTH_TOKEN).toBe("unused");
    expect(open.ANTHROPIC_CUSTOM_HEADERS).toBeUndefined();
  });
});
