import { ClankerAgentEndpointEnvironmentFactory } from "./ClankerAgentEndpointEnvironmentFactory";
import { NoopAgentEndpointEnvironment } from "./NoopAgentEndpointEnvironment";
import { QwenAgentEndpointEnvironment } from "./QwenAgentEndpointEnvironment";

describe("ClankerAgentEndpointEnvironmentFactory", () => {
  test("returns noop environment for non-qwen agents", () => {
    const factory = new ClankerAgentEndpointEnvironmentFactory();
    const environment = factory.create({
      requestedAgent: "claude-code",
    });

    expect(environment).toBeInstanceOf(NoopAgentEndpointEnvironment);
    expect(environment.resolve()).toEqual({});
  });

  test("returns qwen endpoint environment from v1 deployment config", () => {
    const factory = new ClankerAgentEndpointEnvironmentFactory();
    const environment = factory.create({
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
});
