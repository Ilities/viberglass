import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { WorkerModelEndpoint } from "@viberglass/types";
import { codexModelConfig, writeCodexModelConfig } from "../src/codexModelConfig";
import codexPlugin from "../src/plugin";

const endpoint: WorkerModelEndpoint = {
  name: "EU models",
  baseUrl: "https://models.example.com/v1",
  apiFormat: "openai-responses",
  auth: { scheme: "bearer" },
  extraHeaders: { "X-Team": "eu" },
  model: "gpt-oss-120b",
  mayColdStart: false,
};

describe("Codex model endpoint", () => {
  test("selects a Responses provider that reads a bearer key from the environment", () => {
    expect(codexModelConfig(endpoint)).toBe(
      [
        `model = "gpt-oss-120b"`,
        `model_provider = "viberglass"`,
        `model_context_window = 32768`,
        ``,
        `[model_providers.viberglass]`,
        `name = "EU models"`,
        `base_url = "https://models.example.com/v1"`,
        `wire_api = "responses"`,
        `supports_websockets = false`,
        `http_headers = { "X-Team" = "eu" }`,
        `env_key = "MODEL_ENDPOINT_API_KEY"`,
        ``,
      ].join("\n"),
    );
  });

  test("reads a custom header key from the environment, and sends none for an open endpoint", () => {
    expect(codexModelConfig({ ...endpoint, auth: { scheme: "header", header: "api-key" } })).toContain(
      `env_http_headers = { "api-key" = "MODEL_ENDPOINT_API_KEY" }`,
    );
    const open = codexModelConfig({ ...endpoint, auth: { scheme: "none" } });
    expect(open).not.toContain("env_key");
    expect(open).not.toContain("env_http_headers");
  });

  test("writes config.toml into Codex's home", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-"));
    writeCodexModelConfig(endpoint, home);
    expect(fs.readFileSync(path.join(home, "config.toml"), "utf-8")).toContain(`model_provider = "viberglass"`);
  });

  test("skips the OpenAI sign-in when the runner uses a model endpoint", () => {
    const lifecycle = codexPlugin.authLifecycle?.({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never,
      workDir: "",
      clankerConfig: { deploymentConfig: { resolvedModelEndpoint: endpoint } },
      callbackClient: undefined,
      sendProgress: async () => {},
    });
    expect(lifecycle?.constructor.name).toBe("NoopAgentAuthLifecycle");
  });
});
