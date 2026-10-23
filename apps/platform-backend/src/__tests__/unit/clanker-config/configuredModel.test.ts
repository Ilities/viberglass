import { configuredModel } from "../../../clanker-config/configuredModel";

describe("configuredModel", () => {
  it("reads the model endpoint's model first", () => {
    expect(
      configuredModel({
        agent: "opencode",
        modelEndpoint: { endpointId: "e1", model: "Qwen/Qwen3-8B" },
        deploymentConfig: { agent: { type: "opencode", model: "opencode-go/kimi-k3" } },
      }),
    ).toBe("Qwen/Qwen3-8B");
  });

  it("reads the harness setting that takes the provider's default model", () => {
    expect(configuredModel({ agent: "opencode", deploymentConfig: { agent: { type: "opencode", model: " opencode-go/kimi-k3 " } } })).toBe(
      "opencode-go/kimi-k3",
    );
  });

  it("has none when the harness picks its own model", () => {
    expect(configuredModel({ agent: "opencode", deploymentConfig: { agent: { type: "opencode" } } })).toBeUndefined();
    expect(configuredModel({ agent: "claude-code", deploymentConfig: { agent: { type: "claude-code", model: "ignored" } } })).toBeUndefined();
    expect(configuredModel(null)).toBeUndefined();
  });
});
