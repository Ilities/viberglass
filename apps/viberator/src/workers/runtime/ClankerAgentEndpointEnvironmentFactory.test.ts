import { createLogger, transports } from "winston";
import { ClankerAgentEndpointEnvironmentFactory } from "./ClankerAgentEndpointEnvironmentFactory";
import { NoopAgentEndpointEnvironment, sanitizeAgentEnvironment } from "@viberglass/agent-core";
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


test("routes a resolved custom endpoint through the plugin's declared capability", () => {
  const factory = new ClankerAgentEndpointEnvironmentFactory();
  const endpoint = { name: "EU models", baseUrl: "https://eu.example.com/v1", apiFormat: "openai-chat",
    auth: { scheme: "none" }, extraHeaders: {}, model: "qwen", mayColdStart: false };
  const clankerConfig = { agent: "opencode", deploymentConfig: { resolvedModelEndpoint: endpoint } };
  const env = factory.create({ requestedAgent: "opencode", clankerConfig, logger }).resolve();
  expect(env.OPENCODE_MODEL).toBe("viberglass/qwen");
  const sanitized = sanitizeAgentEnvironment({ ...env, MODEL_ENDPOINT_API_KEY: "secret", AWS_SECRET_ACCESS_KEY: "cloud-secret" }, { passthrough: Object.keys(env) }).env;
  expect(sanitized.MODEL_ENDPOINT_API_KEY).toBe("secret");
  expect(sanitized.OPENCODE_CONFIG_CONTENT).toBe(env.OPENCODE_CONFIG_CONTENT);
  expect(sanitized.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT).provider.viberglass.options.baseURL).toBe(endpoint.baseUrl);
  expect(() => factory.create({ requestedAgent: "codex", clankerConfig, logger })).toThrow("unsupported");
  const piEnv = factory.create({ requestedAgent: "pi", clankerConfig, logger }).resolve();
  expect(sanitizeAgentEnvironment(piEnv, { passthrough: Object.keys(piEnv) }).env.PI_CUSTOM_MODELS).toBe(piEnv.PI_CUSTOM_MODELS);
  expect(JSON.parse(piEnv.PI_CUSTOM_MODELS).providers.viberglass.models[0].id).toBe("qwen");
});
