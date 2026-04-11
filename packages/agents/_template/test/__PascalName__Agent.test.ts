import { describe, expect, it } from "@jest/globals";
import __name__Plugin from "../src/plugin";
import { __PascalName__Agent } from "../src";
import { createLogger } from "winston";

const logger = createLogger({ silent: true });

describe("__PascalName__Agent", () => {
  it("creates an agent instance from the plugin", () => {
    const config = {
      name: "__NAME__" as const,
      ...__name__Plugin.defaultConfig,
    };
    const agent = __name__Plugin.create(config, logger);
    expect(agent).toBeInstanceOf(__PascalName__Agent);
  });

  it("plugin has required metadata", () => {
    expect(__name__Plugin.id).toBe("__NAME__");
    expect(__name__Plugin.displayName).toBeTruthy();
    expect(__name__Plugin.docker.variant).toBe("__NAME__");
    expect(__name__Plugin.docker.supportedAgents).toContain("__NAME__");
  });

  // TODO: add agent-specific tests
  // it("getAcpServerCommand returns expected command", () => { … });
  // it("getAcpEnvironment maps API key correctly", () => { … });
});
