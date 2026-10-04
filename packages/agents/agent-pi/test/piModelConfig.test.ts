import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { WorkerModelEndpoint } from "@viberglass/types";
import { PiModelEndpointEnvironment } from "../src/PiModelEndpointEnvironment";
import { writePiModelConfig } from "../src/piModelConfig";

const endpoint: WorkerModelEndpoint = {
  name: "Local",
  baseUrl: "http://localhost:8080/v1",
  model: "qwen",
  apiFormat: "openai-chat",
  auth: { scheme: "header", header: "X-Key" },
  extraHeaders: { "X-Team": "!echo $HOME" },
  mayColdStart: false,
};

test("writes an env-referenced model and preserves unrelated Pi configuration", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-model-test-"));
  const previousModels = process.env.PI_CUSTOM_MODELS;
  const previousModel = process.env.PI_CUSTOM_MODEL;
  try {
    const env = new PiModelEndpointEnvironment(endpoint).resolve();
    process.env.PI_CUSTOM_MODELS = env.PI_CUSTOM_MODELS;
    process.env.PI_CUSTOM_MODEL = env.PI_CUSTOM_MODEL;
    fs.writeFileSync(
      path.join(dir, "models.json"),
      JSON.stringify({ providers: { existing: { models: [] } } }),
    );
    fs.writeFileSync(
      path.join(dir, "settings.json"),
      JSON.stringify({ theme: "dark" }),
    );
    writePiModelConfig(dir);
    const config = JSON.parse(
      fs.readFileSync(path.join(dir, "models.json"), "utf8"),
    );
    expect(config.providers.existing).toEqual({ models: [] });
    expect(config.providers.viberglass).toMatchObject({
      api: "openai-completions",
      baseUrl: endpoint.baseUrl,
      apiKey: "anonymous",
      authHeader: false,
      headers: {
        "X-Key": "$MODEL_ENDPOINT_API_KEY",
        "X-Team": "$!echo $$HOME",
      },
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8")),
    ).toEqual({
      theme: "dark",
      defaultProvider: "viberglass",
      defaultModel: "qwen",
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousModels === undefined) delete process.env.PI_CUSTOM_MODELS;
    else process.env.PI_CUSTOM_MODELS = previousModels;
    if (previousModel === undefined) delete process.env.PI_CUSTOM_MODEL;
    else process.env.PI_CUSTOM_MODEL = previousModel;
  }
});

test.each(["openai-chat", "openai-responses", "anthropic-messages"] as const)(
  "maps %s to Pi's API type",
  (apiFormat) => {
    const config = JSON.parse(
      new PiModelEndpointEnvironment({
        ...endpoint,
        apiFormat,
        auth: { scheme: "bearer" },
      }).resolve().PI_CUSTOM_MODELS,
    );
    expect(config.providers.viberglass.api).toBe(
      apiFormat === "openai-chat" ? "openai-completions" : apiFormat,
    );
    expect(config.providers.viberglass.headers.Authorization).toBe(
      "Bearer $MODEL_ENDPOINT_API_KEY",
    );
  },
);
