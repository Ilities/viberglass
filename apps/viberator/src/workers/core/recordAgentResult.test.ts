import type { WorkerModelEndpoint } from "@viberglass/types";
import type { ManifestScratch } from "./jobPipeline";
import { recordAgentResult, type ExecutionResultLike } from "./recordAgentResult";

const endpoint: WorkerModelEndpoint = {
  name: "OpenCode Go",
  baseUrl: "https://go.example.com/v1",
  model: "glm-5.3",
  apiFormat: "anthropic-messages",
  auth: { scheme: "bearer" },
  extraHeaders: {},
  mayColdStart: false,
};

function record(result: ExecutionResultLike, runEndpoint?: WorkerModelEndpoint): ManifestScratch {
  const manifest: ManifestScratch = { usageAvailable: false, costProvenance: "unavailable", startedAt: "" };
  recordAgentResult(manifest, "claude-code", result, "completed", runEndpoint);
  return manifest;
}

test("records the endpoint's model rather than the name the harness's config gave it", () => {
  expect(record({ usage: { inputTokens: 10, model: "opus" }, model: "opus" }, endpoint).modelSnapshot).toBe("glm-5.3");
  expect(record({ model: "viberglass/glm-5.3" }, endpoint).modelSnapshot).toBe("glm-5.3");
});

test("records the model the harness reported when the run has no endpoint", () => {
  expect(record({ usage: { inputTokens: 10, model: "claude-haiku-5-5" }, model: "haiku" }).modelSnapshot).toBe("claude-haiku-5-5");
  expect(record({ model: "kimi-k3.1-pro" }).modelSnapshot).toBe("kimi-k3.1-pro");
});

test("a run whose harness reported neither usage nor a model ran no model, endpoint or not", () => {
  expect(record({ cost: 0.5 }).modelSnapshot).toBeUndefined();
  expect(record({ cost: 0.5 }, endpoint).modelSnapshot).toBeUndefined();
  expect(record({ usage: { inputTokens: 10 } }, endpoint).modelSnapshot).toBe("glm-5.3");
});

test("a run that reported no usage has no cost, not the plugin's estimate", () => {
  const manifest = record({ cost: 0.5 });
  expect(manifest.costUsd).toBeUndefined();
  expect(manifest.costProvenance).toBe("unavailable");
  expect(manifest.usageAvailable).toBe(false);
});

test("a harness's own cost on an endpoint's model isn't kept, since its price table doesn't cover that model", () => {
  const manifest = record({ cost: 0, usage: { inputTokens: 1000, outputTokens: 50, costUsd: 0.19 } }, endpoint);
  expect(manifest.costUsd).toBeUndefined();
  expect(manifest.costProvenance).toBe("unavailable");
  expect(manifest.usage).toMatchObject({ inputTokens: 1000, outputTokens: 50 });
});

test("a harness's own cost on its own provider is actual, and the plugin's constant an estimate", () => {
  expect(record({ cost: 0.5, usage: { inputTokens: 10, costUsd: 0.02 } })).toMatchObject({ costUsd: 0.02, costProvenance: "actual" });
  expect(record({ cost: 0.5, usage: { inputTokens: 10 } })).toMatchObject({ costUsd: 0.5, costProvenance: "estimated" });
});

test("a harness that prices its calls but couldn't tell this run's share has no cost, not the plugin's constant", () => {
  const manifest = record({ cost: 0, usage: { inputTokens: 10, costUnknown: true } });
  expect(manifest.costUsd).toBeUndefined();
  expect(manifest.costProvenance).toBe("unavailable");
  expect(manifest.usageAvailable).toBe(true);
});

test("a turn whose harness reports tokens but never a cost has no cost, not $0", () => {
  const manifest = record({ usage: { inputTokens: 10, outputTokens: 5 } });
  expect(manifest.costUsd).toBeUndefined();
  expect(manifest.costProvenance).toBe("unavailable");
  expect(manifest.usageAvailable).toBe(true);
});
