import type { AcpContextUsage, AcpSessionStart } from "@viberglass/agent-core";
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_VG_AGENT_AUTH_RETRIED,
  ATTR_VG_AGENT_SESSION_ID,
  ATTR_VG_AGENT_TURN_ID,
  ATTR_VG_CHANGED_FILE_COUNT,
  ATTR_VG_JOB_ID,
  ATTR_VG_SESSION_MODE,
  ATTR_VG_STOP_REASON,
  ATTR_VG_TENANT_ID,
  definedAttributes,
  markSpanFailed,
  providerNameForAgent,
  SpanKind,
  withSpan,
} from "@viberglass/telemetry";
import { JOB_FAILURE_CODE } from "@viberglass/types";
import { ExecutionContext } from "../../types";
import { classifyAgentFailure } from "./classifyAgentFailure";
import { failingWith, JobFailureError } from "./JobFailureError";
import type { AgentAuthContext } from "./agentAuthLifecycle";
import type { JobRunnerParams, ManifestScratch } from "./jobPipeline";
import { installSkills } from "./installSkills";

export interface AgentExecutionResult {
  success: boolean;
  changedFiles: string[];
  errorMessage?: string;
  newAcpSessionId?: string;
  acpSessionStart?: AcpSessionStart;
  acpContextUsage?: AcpContextUsage;
  acpCompacted?: boolean;
}

/**
 * Select an agent, ensure auth, execute with auth-retry logic.
 */
export async function executeAgentWithRetry(
  params: JobRunnerParams,
  executionContext: ExecutionContext,
): Promise<AgentExecutionResult> {
  const {
    data,
    orchestrator,
    agentAuthLifecycle,
    selectAgentForExecution,
    sendProgress,
    logger,
  } = params;

  const availableAgents = orchestrator.getAvailableAgents();
  const selectedAgent = selectAgentForExecution(availableAgents);
  executionContext.agent = selectedAgent.name;

  const authContext: AgentAuthContext = {
    agentName: selectedAgent.name,
    jobId: data.id,
    tenantId: data.tenantId,
  };
  await failingWith(JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID, () =>
    agentAuthLifecycle.ensureReady(authContext),
  );
  await installSkills(params, selectedAgent.name);

  const executeSelectedAgent = () =>
    orchestrator.executeAgent(selectedAgent, executionContext);

  await sendProgress("execute", "Running AI agent", {
    agentName: selectedAgent.name,
  });
  logger.info("Agent selected", { agentName: selectedAgent.name });

  // Orchestration span: agent selection, auth readiness and the auth retry.
  // Deliberately *not* tagged with `gen_ai.operation.name` — the GenAI
  // `invoke_agent` span is the one BaseAgent opens around the CLI itself,
  // which is where the model and token usage are actually known. Tagging both
  // would double-count every agent invocation in per-operation aggregates.
  return withSpan(
    `agent.execute ${selectedAgent.name}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: definedAttributes({
        [ATTR_GEN_AI_AGENT_NAME]: selectedAgent.name,
        [ATTR_GEN_AI_PROVIDER_NAME]: providerNameForAgent(selectedAgent.name),
        [ATTR_VG_JOB_ID]: data.id,
        [ATTR_VG_TENANT_ID]: data.tenantId,
        [ATTR_VG_AGENT_SESSION_ID]: params.agentSessionId,
        [ATTR_VG_AGENT_TURN_ID]: params.agentTurnId,
        [ATTR_VG_SESSION_MODE]: params.turnAction,
      }),
    },
    async (span) => {
      let result = await executeSelectedAgent();
      let authRetried = false;

      if (agentAuthLifecycle.shouldRetryAfterFailure(authContext, result)) {
        authRetried = true;
        logger.warn(
          "Agent execution failed due to auth; retrying after auth refresh",
          {
            jobId: data.id,
            agentName: selectedAgent.name,
            errorMessage: result.errorMessage,
          },
        );
        // Recorded as an event rather than a second span: the retry is the
        // same logical agent invocation, and splitting it would double-count
        // agent runs in any per-attempt aggregate.
        span.addEvent("agent.auth_refresh", {
          "vg.agent.first_attempt_error": result.errorMessage ?? "",
        });
        await sendProgress(
          "auth",
          "Agent auth failed, refreshing authentication",
          { agentName: selectedAgent.name },
        );
        await agentAuthLifecycle.refreshAfterFailure(authContext);
        await sendProgress("execute", "Retrying AI agent after auth refresh", {
          agentName: selectedAgent.name,
          retry: 1,
        });
        result = await executeSelectedAgent();
      }

      // Even a failed run may have refreshed the agent's login.
      await agentAuthLifecycle.persistAfterRun(authContext);

      const stopReason = result.success ? "completed" : "failed";

      span.setAttributes(
        definedAttributes({
          [ATTR_VG_AGENT_AUTH_RETRIED]: authRetried,
          [ATTR_VG_CHANGED_FILE_COUNT]: result.changedFiles?.length,
          [ATTR_VG_STOP_REASON]: stopReason,
        }),
      );

      recordAgentResultInManifest(params.manifest, selectedAgent.name, result, stopReason);

      if (!result.success) {
        // Thrown so the job fails as before; marked first so the reason is on
        // the span even though withSpan would also record the exception.
        markSpanFailed(span, result.errorMessage || "Agent execution failed");
        throw new JobFailureError(
          classifyAgentFailure(result.errorMessage),
          result.errorMessage || "Agent execution failed",
        );
      }

      return result;
    },
  );
}

/**
 * Copies what the agent reported into the manifest scratch.
 *
 * Cost provenance is the point of the branching below. A CLI-reported cost is
 * `actual`; the plugin's `costPerExecution` constant is `estimated`; a plugin
 * with neither records `unavailable`. Collapsing these would make a hardcoded
 * constant indistinguishable from a measurement in the eval corpus.
 */
function recordAgentResultInManifest(
  manifest: ManifestScratch | undefined,
  agentName: string,
  result: ExecutionResultLike,
  stopReason: string,
): void {
  if (!manifest) return;

  manifest.agent = agentName;
  manifest.stopReason = stopReason;
  manifest.promptHash = result.promptHash;
  manifest.promptCharacters = result.promptCharacters;

  const usage = result.usage;
  manifest.usageAvailable = Boolean(usage);

  if (usage) {
    manifest.modelSnapshot = usage.model;
    manifest.harnessVersion = usage.harnessVersion;
    manifest.usage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      reasoningOutputTokens: usage.reasoningOutputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
    };
  }

  if (usage?.costUsd !== undefined) {
    manifest.costUsd = usage.costUsd;
    manifest.costProvenance = "actual";
  } else if (typeof result.cost === "number" && Number.isFinite(result.cost)) {
    manifest.costUsd = result.cost;
    manifest.costProvenance = "estimated";
  } else {
    manifest.costProvenance = "unavailable";
  }
}

/** The subset of the agent's ExecutionResult the manifest reads. */
interface ExecutionResultLike {
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
    model?: string;
    harnessVersion?: string;
  };
}
