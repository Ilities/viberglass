import type { WorkerModelEndpoint } from "@viberglass/types";
import type { ManifestScratch } from "./jobPipeline";

/** The subset of the agent's ExecutionResult the manifest reads. */
export interface ExecutionResultLike {
  cost?: number;
  promptHash?: string;
  promptCharacters?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningOutputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    costUsd?: number;
    costUnknown?: boolean;
    model?: string;
    harnessVersion?: string;
  };
  model?: string;
}

/**
 * Copies what the agent reported into the manifest scratch.
 *
 * On a workspace model endpoint the harness only knows the model by the name
 * the worker gave it in the harness's config, so the endpoint's model is the
 * one recorded. A harness prices tokens from its own provider's table, which
 * has no price for an endpoint's model, so a run on an endpoint has no cost.
 * A run that reported no usage never reached a model, and has no cost either;
 * without a model named either, it records none, not the endpoint's.
 *
 * Otherwise a CLI-reported cost is `actual` and the plugin's `costPerExecution`
 * constant, which only one-shot runs carry, is `estimated`, so a constant is
 * never mistaken for a measurement. A turn whose harness doesn't price its
 * calls has neither.
 * A CLI that prices its calls but couldn't tell this run's share gets no
 * estimate either: the constant would stand in for a real cost.
 */
export function recordAgentResult(
  manifest: ManifestScratch,
  agentName: string,
  result: ExecutionResultLike,
  stopReason: string,
  endpoint: WorkerModelEndpoint | undefined,
): void {
  manifest.agent = agentName;
  manifest.stopReason = stopReason;
  manifest.promptHash = result.promptHash;
  manifest.promptCharacters = result.promptCharacters;

  const usage = result.usage;
  manifest.usageAvailable = Boolean(usage);

  const reachedModel = Boolean(usage || result.model);
  manifest.modelSnapshot = reachedModel ? endpoint?.model ?? usage?.model ?? result.model : undefined;
  if (usage) {
    manifest.harnessVersion = usage.harnessVersion;
    manifest.usage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      reasoningOutputTokens: usage.reasoningOutputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
    };
  }

  if (!usage || endpoint || usage.costUnknown) {
    manifest.costProvenance = "unavailable";
  } else if (usage.costUsd !== undefined) {
    manifest.costUsd = usage.costUsd;
    manifest.costProvenance = "actual";
  } else if (typeof result.cost === "number" && Number.isFinite(result.cost)) {
    manifest.costUsd = result.cost;
    manifest.costProvenance = "estimated";
  } else {
    manifest.costProvenance = "unavailable";
  }
}
