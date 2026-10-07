import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { WorkerModelEndpoint } from "@viberglass/types";
import { kimiModelConfig, writeKimiModelConfig } from "../src/kimiModelConfig";

const endpoint: WorkerModelEndpoint = {
  name: "EU models",
  baseUrl: "https://models.example.com/v1",
  apiFormat: "openai-chat",
  auth: { scheme: "bearer" },
  extraHeaders: { "X-Team": "eu" },
  model: "qwen",
  mayColdStart: false,
};
const env = { MODEL_ENDPOINT_API_KEY: "secret" };

describe("Kimi model endpoint", () => {
  test("makes the endpoint's model the default and reads a bearer key from the environment", () => {
    expect(kimiModelConfig(endpoint, env)).toBe(
      [
        `default_model = "viberglass"`,
        `telemetry = false`,
        ``,
        `[providers.viberglass]`,
        `type = "openai"`,
        `base_url = "https://models.example.com/v1"`,
        `api_key_env = "MODEL_ENDPOINT_API_KEY"`,
        `custom_headers = { "X-Team" = "eu" }`,
        ``,
        `[models.viberglass]`,
        `provider = "viberglass"`,
        `model = "qwen"`,
        `max_context_size = 32768`,
        ``,
      ].join("\n"),
    );
  });

  test("reads an Anthropic x-api-key from the environment", () => {
    const config = kimiModelConfig(
      { ...endpoint, apiFormat: "anthropic-messages", auth: { scheme: "header", header: "x-api-key" } },
      env,
    );
    expect(config).toContain(`type = "anthropic"`);
    expect(config).toContain(`api_key_env = "MODEL_ENDPOINT_API_KEY"`);
    expect(config).not.toContain("secret");
  });

  test("writes a key Kimi can't send itself into the headers", () => {
    const config = kimiModelConfig(
      { ...endpoint, apiFormat: "openai-responses", auth: { scheme: "header", header: "api-key" } },
      env,
    );
    expect(config).toContain(`type = "openai_responses"`);
    expect(config).toContain(`api_key = "unused"`);
    expect(config).toContain(`custom_headers = { "X-Team" = "eu", "api-key" = "secret" }`);
  });

  test("escapes values as TOML strings", () => {
    expect(kimiModelConfig({ ...endpoint, model: 'odd "model"\\name' }, env)).toContain(
      `model = "odd \\"model\\"\\\\name"`,
    );
  });

  test("writes the config privately under the home directory", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-"));
    writeKimiModelConfig({ ...endpoint, auth: { scheme: "none" } }, home);
    const file = path.join(home, ".kimi-code", "config.toml");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(file, "utf-8")).toContain(`api_key = "unused"`);
  });
});
