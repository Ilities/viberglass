import { GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN } from "@viberglass/telemetry";
import { buildAgentRegistry } from "./registerPlugins";

describe("agent telemetry provider", () => {
  const registry = buildAgentRegistry();

  it("is the provider the plugin names", () => {
    expect(registry.getTelemetryProvider("claude-code")).toBe("anthropic");
    expect(registry.getTelemetryProvider("qwen-cli")).toBe("alibaba.qwen");
  });

  it("is unknown for a harness whose provider depends on its configuration, or an unknown harness", () => {
    expect(registry.getTelemetryProvider("opencode")).toBe(GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN);
    expect(registry.getTelemetryProvider("not-registered")).toBe(GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN);
  });
});
