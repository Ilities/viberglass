import type { Clanker } from "@viberglass/types";
import {
  buildNativeAgentConfigTemplate,
  validateClankerConfigFiles,
} from "../../../../services/clanker-config-files/nativeAgentConfig";

function createClanker(overrides: Partial<Clanker> = {}): Clanker {
  return {
    id: "clanker-1",
    name: "Test Clanker",
    slug: "test-clanker",
    description: null,
    deploymentStrategyId: "strategy-1",
    deploymentStrategy: {
      id: "strategy-1",
      name: "docker",
      description: null,
      configSchema: null,
      createdAt: new Date().toISOString(),
    },
    deploymentConfig: {
      version: 1,
      strategy: {
        type: "docker",
        provisioningMode: "managed",
      },
      agent: {
        type: "opencode",
        endpoint: "https://api.example.com",
        model: "gpt-5",
      },
    },
    configFiles: [],
    agent: "opencode",
    secretIds: [],
    status: "inactive",
    statusMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("nativeAgentConfig helpers", () => {
  test("splits instruction files from a supported native config file", () => {
    const result = validateClankerConfigFiles("opencode", [
      { fileType: "AGENTS.md", content: "instructions" },
      { fileType: "skills/review.md", content: "review" },
      { fileType: "config/opencode.json", content: '{ "model": "gpt-5" }' },
    ]);

    expect(result.instructionFiles).toEqual([
      { fileType: "AGENTS.md", content: "instructions" },
      { fileType: "skills/review.md", content: "review" },
    ]);
    expect(result.nativeAgentConfigFile).toEqual({
      fileType: "config/opencode.json",
      content: '{ "model": "gpt-5" }',
    });
  });

  test("rejects native config files for unsupported agents", () => {
    expect(() =>
      validateClankerConfigFiles("claude-code", [
        { fileType: ".claude/config.json", content: "{}" },
      ]),
    ).toThrow('Agent "claude-code" does not support native config files.');
  });

  test("builds a native config template from structured clanker config", () => {
    const template = buildNativeAgentConfigTemplate("opencode", createClanker());

    expect(template).toEqual({
      agent: "opencode",
      supported: true,
      defaultPath: "opencode.json",
      format: "json",
      content: '{\n  "endpoint": "https://api.example.com",\n  "model": "gpt-5"\n}\n',
      pathOverrideAllowed: true,
    });
  });
});
