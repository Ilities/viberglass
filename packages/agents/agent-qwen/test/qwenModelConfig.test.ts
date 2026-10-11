import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { WorkerModelEndpoint } from "@viberglass/types";
import { qwenModelSettings, writeQwenModelSettings } from "../src/qwenModelConfig";

const endpoint: WorkerModelEndpoint = {
  name: "EU models",
  baseUrl: "https://models.example.com/v1",
  apiFormat: "openai-chat",
  auth: { scheme: "bearer" },
  extraHeaders: { "X-Team": "eu" },
  model: "qwen",
  mayColdStart: false,
};

describe("Qwen model endpoint", () => {
  test("selects the endpoint's model and reads a bearer key from the environment", () => {
    expect(qwenModelSettings(endpoint)).toEqual({
      security: { auth: { selectedType: "openai" } },
      model: { name: "qwen" },
      privacy: { usageStatisticsEnabled: false },
      modelProviders: {
        openai: [
          {
            id: "qwen",
            baseUrl: "https://models.example.com/v1",
            envKey: "MODEL_ENDPOINT_API_KEY",
            generationConfig: { contextWindowSize: 32768, customHeaders: { "X-Team": "eu" } },
          },
        ],
      },
    });
  });

  test("sends a custom header key by reference, with a placeholder bearer key", () => {
    const settings = qwenModelSettings({
      ...endpoint,
      apiFormat: "anthropic-messages",
      auth: { scheme: "header", header: "x-api-key" },
    });
    expect(settings.security).toEqual({ auth: { selectedType: "anthropic" } });
    expect(settings.modelProviders).toEqual({
      anthropic: [
        expect.objectContaining({
          envKey: "QWEN_PLACEHOLDER_API_KEY",
          generationConfig: {
            contextWindowSize: 32768,
            customHeaders: { "X-Team": "eu", "x-api-key": "$MODEL_ENDPOINT_API_KEY" },
          },
        }),
      ],
    });
  });

  test("writes the settings privately, without the key", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qwen-"));
    const file = writeQwenModelSettings({ ...endpoint, apiFormat: "openai-responses" }, path.join(dir, "qwen"));
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).modelProviders["openai-responses"]).toHaveLength(1);
  });
});
