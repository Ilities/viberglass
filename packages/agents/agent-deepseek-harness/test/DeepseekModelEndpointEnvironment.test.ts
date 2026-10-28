import { DeepseekModelEndpointEnvironment } from "../src/DeepseekModelEndpointEnvironment";
import type { WorkerModelEndpoint } from "@viberglass/types";
import { describe, expect, it } from "@jest/globals";

describe("DeepseekModelEndpointEnvironment", () => {
  it("sets endpoint, model and credential forwarding for an OpenAI-compatible endpoint", () => {
    const endpoint: WorkerModelEndpoint = {
      name: "mock",
      baseUrl: "http://mock/v1",
      apiFormat: "openai-chat",
      auth: { scheme: "bearer" },
      extraHeaders: { "X-Trace": "trace" },
      model: "mock-model",
      contextWindow: 8192,
      mayColdStart: false,
    };
    const env = new DeepseekModelEndpointEnvironment(endpoint).resolve();
    expect(env.DEEPSEEK_BASE_URL).toBe("http://mock/v1");
    expect(env.DEEPSEEK_API_KEY).toBe("MODEL_ENDPOINT_API_KEY");
    expect(env.DSH_MODEL).toBe("mock-model");
    expect(env.DSH_ACP_ENDPOINT_HEADERS).toContain("X-Trace");
    expect(env.DSH_ACP_ENDPOINT_HEADERS).toContain("Bearer MODEL_ENDPOINT_API_KEY");
  });
});
