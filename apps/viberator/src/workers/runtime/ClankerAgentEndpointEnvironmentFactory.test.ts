import { createLogger, transports } from "winston";
import { ClankerAgentEndpointEnvironmentFactory } from "./ClankerAgentEndpointEnvironmentFactory";
import { NoopAgentEndpointEnvironment } from "@viberglass/agent-core";
import { OpenCodeAgentEndpointEnvironment } from "@viberglass/agent-opencode";
import { QwenAgentEndpointEnvironment } from "@viberglass/agent-qwen";

const logger = createLogger({
  silent: true,
  transports: [new transports.Console({ silent: true })],
});

describe("ClankerAgentEndpointEnvironmentFactory", () => {
  test("returns noop environment for non-qwen agents", () => {
    const factory = new ClankerAgentEndpointEnvironmentFactory();
    const environment = factory.create({
      requestedAgent: "claude-code",
      logger,
    });

    expect(environment).toBeInstanceOf(NoopAgentEndpointEnvironment);
    expect(environment.resolve()).toEqual({});
  });

  test("returns qwen endpoint environment from v1 deployment config", () => {
    const factory = new ClankerAgentEndpointEnvironmentFactory();
    const environment = factory.create({
      logger,
      clankerConfig: {
        version: 1,
        strategy: { type: "ecs" },
        agent: {
          type: "qwen-cli",
          endpoint: "https://qwen.example.com/v1",
        },
      },
    });

    expect(environment).toBeInstanceOf(QwenAgentEndpointEnvironment);
    expect(environment.resolve()).toEqual({
      QWEN_CLI_ENDPOINT: "https://qwen.example.com/v1",
      QWEN_API_ENDPOINT: "https://qwen.example.com/v1",
    });
  });

  test("returns qwen endpoint environment from legacy config", () => {
    const factory = new ClankerAgentEndpointEnvironmentFactory();
    const environment = factory.create({
      logger,
      clankerConfig: {
        agent: "qwen-cli",
        qwenEndpoint: "https://qwen.legacy.example.com/v1",
      },
    });

    expect(environment).toBeInstanceOf(QwenAgentEndpointEnvironment);
    expect(environment.resolve()).toEqual({
      QWEN_CLI_ENDPOINT: "https://qwen.legacy.example.com/v1",
      QWEN_API_ENDPOINT: "https://qwen.legacy.example.com/v1",
    });
  });

  test("returns noop when qwen endpoint is missing", () => {
    const factory = new ClankerAgentEndpointEnvironmentFactory();
    const environment = factory.create({
      logger,
      requestedAgent: "qwen-cli",
      clankerConfig: {
        version: 1,
        agent: {
          type: "qwen-cli",
        },
      },
    });

    expect(environment).toBeInstanceOf(NoopAgentEndpointEnvironment);
    expect(environment.resolve()).toEqual({});
  });

  test("returns opencode environment from v1 deployment config", () => {
    const factory = new ClankerAgentEndpointEnvironmentFactory();
    const environment = factory.create({
      logger,
      clankerConfig: {
        version: 1,
        strategy: { type: "docker" },
        agent: {
          type: "opencode",
          endpoint: "https://openrouter.ai/api/v1",
          model: "openai/gpt-5",
        },
      },
    });

    expect(environment).toBeInstanceOf(OpenCodeAgentEndpointEnvironment);
    expect(environment.resolve()).toEqual({
      OPENCODE_BASE_URL: "https://openrouter.ai/api/v1",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
      OPENCODE_MODEL: "openai/gpt-5",
    });
  });

  test("returns opencode environment from legacy config", () => {
    const factory = new ClankerAgentEndpointEnvironmentFactory();
    const environment = factory.create({
      logger,
      clankerConfig: {
        agent: "opencode",
        endpoint: "https://api.openai.com/v1",
      },
    });

    expect(environment).toBeInstanceOf(OpenCodeAgentEndpointEnvironment);
    expect(environment.resolve()).toEqual({
      OPENCODE_BASE_URL: "https://api.openai.com/v1",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
    });
  });
});
