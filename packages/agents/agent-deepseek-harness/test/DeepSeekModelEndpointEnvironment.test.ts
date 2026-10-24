import { DeepSeekModelEndpointEnvironment } from "../src";
import type { WorkerModelEndpoint } from "@viberglass/types";

function endpoint(): WorkerModelEndpoint {
  return {
    name: "Mock model for DeepSeek Harness",
    baseUrl: "http://localhost:8081/v1",
    apiFormat: "openai-chat",
    auth: { scheme: "bearer" },
    extraHeaders: {},
    model: "deepseek-v4-pro",
    mayColdStart: false,
  };
}

describe("DeepSeekModelEndpointEnvironment", () => {
  it("points the harness at the endpoint and its model", () => {
    expect(new DeepSeekModelEndpointEnvironment(endpoint()).resolve()).toEqual({
      DEEPSEEK_BASE_URL: "http://localhost:8081/v1",
      DSH_MODEL: "deepseek-v4-pro",
    });
  });
});
