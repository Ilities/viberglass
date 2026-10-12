import { createLogger, transports } from "winston";
import { ClankerAgentEndpointEnvironmentFactory } from "./ClankerAgentEndpointEnvironmentFactory";
import { NoopAgentEndpointEnvironment, sanitizeAgentEnvironment } from "@viberglass/agent-core";
import { agentRegistry } from "../../agents/registerPlugins";

const logger = createLogger({
  silent: true,
  transports: [new transports.Console({ silent: true })],
});

function resolveFor(agent: Record<string, unknown>, requestedAgent?: string): Record<string, string> {
  const factory = new ClankerAgentEndpointEnvironmentFactory();
  return factory.create({ logger, requestedAgent, clankerConfig: { version: 1, strategy: { type: "docker" }, agent } }).resolve();
}

describe("ClankerAgentEndpointEnvironmentFactory", () => {
  test("returns noop environment for an agent without settings", () => {
    const factory = new ClankerAgentEndpointEnvironmentFactory();
    const environment = factory.create({
      requestedAgent: "claude-code",
      logger,
    });

    expect(environment).toBeInstanceOf(NoopAgentEndpointEnvironment);
    expect(environment.resolve()).toEqual({});
  });

  test("sets each declared setting's env vars to the runner's value", () => {
    expect(resolveFor({ type: "qwen-cli", endpoint: "https://qwen.example.com/v1" })).toEqual({
      QWEN_CLI_ENDPOINT: "https://qwen.example.com/v1",
      QWEN_API_ENDPOINT: "https://qwen.example.com/v1",
    });
    expect(resolveFor({ type: "opencode", endpoint: "https://openrouter.ai/api/v1", model: "openai/gpt-5" })).toEqual({
      OPENCODE_BASE_URL: "https://openrouter.ai/api/v1",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
      OPENCODE_MODEL: "openai/gpt-5",
    });
    expect(resolveFor({ type: "kimi-code", endpoint: "https://api.moonshot.ai/v1", model: "kimi-k3" })).toEqual({
      KIMI_BASE_URL: "https://api.moonshot.ai/v1",
      KIMI_MODEL_NAME: "kimi-k3",
    });
    expect(resolveFor({ type: "antigravity", model: "gemini-3.1-pro-high" })).toEqual({
      AGY_ACP_DEFAULT_MODEL: "gemini-3.1-pro-high",
    });
  });

  test("leaves the harness defaults alone when the runner sets nothing", () => {
    expect(resolveFor({ type: "qwen-cli", endpoint: "  " })).toEqual({});
    expect(resolveFor({ type: "kimi-code" })).toEqual({});
  });

  test("ignores settings and keys the harness doesn't declare", () => {
    expect(resolveFor({ type: "opencode", model: "x" }, "kimi-code")).toEqual({});
    expect(resolveFor({ type: "claude-code", model: "x" })).toEqual({});
  });

  test("every env var a harness setting declares reaches the harness", () => {
    const names = agentRegistry().list().flatMap((plugin) => (plugin.settings ?? []).flatMap((field) => field.env));
    const env = Object.fromEntries(names.map((name) => [name, "value"]));
    expect(sanitizeAgentEnvironment(env, { passthrough: [] }).env).toEqual(env);
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
