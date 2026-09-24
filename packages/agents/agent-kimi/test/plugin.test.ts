import { createLogger, transports } from "winston";
import kimiCodePlugin from "../src/plugin";

const logger = createLogger({ transports: [new transports.Console({ silent: true })] });

function resolveFor(deploymentConfig: Record<string, unknown>): Record<string, string> {
  const environment = kimiCodePlugin.endpointEnvironment?.({
    logger,
    workDir: "/tmp",
    clankerConfig: { deploymentConfig },
    callbackClient: null,
    sendProgress: async () => undefined,
  });
  return environment?.resolve() ?? {};
}

describe("kimi-code plugin", () => {
  it("hands the runner's endpoint and model to the agent", () => {
    expect(
      resolveFor({
        version: 1,
        agent: { type: "kimi-code", endpoint: "https://api.moonshot.ai/v1", model: "kimi-k3" },
      }),
    ).toEqual({ KIMI_BASE_URL: "https://api.moonshot.ai/v1", KIMI_MODEL_NAME: "kimi-k3" });
  });

  it("leaves Kimi Code's defaults alone when the runner sets nothing", () => {
    expect(resolveFor({ version: 1, agent: { type: "kimi-code" } })).toEqual({});
  });

  it("ignores another agent's settings", () => {
    expect(resolveFor({ version: 1, agent: { type: "opencode", model: "x" } })).toEqual({});
  });

  it("doesn't pin a model, so Kimi Code's own default applies", () => {
    expect(kimiCodePlugin.defaultConfig).not.toHaveProperty("model");
  });
});
