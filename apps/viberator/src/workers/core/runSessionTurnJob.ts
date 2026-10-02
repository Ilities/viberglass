import * as os from "os";
import * as path from "path";
import { ExecutionContext } from "../../types";
import { JobResult } from "./types";
import { JobRunnerParams, setupJob } from "./jobPipeline";
import { executeAgentWithRetry } from "./agentExecution";
import { withJobLifecycle } from "./jobLifecycle";
import { captureAndStore, retrieveAndRestore } from "../runtime/SessionStateManager";
import { deliverPullRequest } from "./deliverPullRequest";
import { collectArtifacts, materializeArtifacts } from "./turnArtifacts";
import { discardCodeChanges, listCodeChanges, restoreArtifactFiles } from "./workingTreeChanges";
import { QuestionRelay } from "../../questions/QuestionRelay";
import { peoplesChanges } from "./peoplesChanges";
import { keepPartialWork } from "./keepPartialWork";
import { onStop } from "../runtime/stopSignal";

/**
 * One turn of a task's conversation with its agent. The agent gets
 * the task's documents as files to revise, and its earlier session when the
 * harness can continue one. Afterwards the turn reports what it produced: the
 * documents it wrote, and its code changes as a commit on the task's pull
 * request when it was allowed to write code, else thrown away.
 */
export async function runSessionTurnJob(params: JobRunnerParams): Promise<JobResult> {
  return withJobLifecycle(params, "Session turn", async () => {
    const { data, logger, sendProgress } = params;
    params.sessionEventForwarder?.setupForJob(data.id, data.tenantId);

    const setup = await setupJob(params, "session-turn");
    const { repoDir, checkoutBaseBranch, mergedSettings } = setup;
    await restoreConversationState(params);
    const pushed = setup.taskBranch?.continued
      ? await peoplesChanges(repoDir, params.lastAgentCommit ?? `origin/${checkoutBaseBranch}`)
      : null;
    const withPushed = (prompt: string | undefined) => (prompt && pushed ? `${pushed}\n\n${prompt}` : prompt);
    const snapshot = materializeArtifacts(repoDir, {
      research: data.context?.researchDocument,
      plan: data.context?.planDocument,
      summary: data.context?.summaryDocument,
    });

    const executionContext: ExecutionContext = {
      repoUrl: data.repository,
      branch: checkoutBaseBranch,
      baseBranch: checkoutBaseBranch,
      repoDir,
      commitHash: "",
      jobKind: data.jobKind,
      bugDescription: withPushed(data.task) ?? data.task,
      stepsToReproduce: "",
      expectedBehavior: "",
      actualBehavior: "",
      consoleErrors: [],
      affectedFiles: [],
      ticketMedia: data.context?.ticketMedia || [],
      maxChanges: mergedSettings.maxChanges,
      testRequired: params.allowCode ? mergedSettings.testRequired : false,
      codingStandards: params.allowCode ? mergedSettings.codingStandards : undefined,
      runTests: params.allowCode ? mergedSettings.runTests : false,
      testCommand: params.allowCode ? mergedSettings.testCommand : undefined,
      maxExecutionTime: mergedSettings.maxExecutionTime,
      promptOverride: withPushed(data.task),
      coldStartPrompt: withPushed(params.coldStartTask),
      compactInstructions: params.compactInstructions,
      agentSessionId: params.agentSessionId,
      acpSessionId: params.acpSessionId,
      onAcpEvent: (event) => params.sessionEventForwarder?.enqueue(event),
    };

    // Stopped partway (cancelled, paused, interrupted), the turn keeps what it had done.
    const partialRun = {
      jobId: data.id,
      tenantId: data.tenantId,
      allowCode: params.allowCode,
      scmToken: params.scmToken,
      git: params.gitService,
      callbacks: params.callbackClient.turn,
      logger,
    };
    const stopped = onStop(() => keepPartialWork(partialRun, { repoDir, snapshot, taskBranch: setup.taskBranch }));
    await sendProgress("execute", "Running ACP agent turn");
    const relay = new QuestionRelay(
      { sendQuestion: (question) => params.callbackClient.turn.sendQuestion(data.id, data.tenantId, question) },
      askHumanServerScript(),
    );
    executionContext.mcpServers = [await relay.start()];
    const result = await executeAgentWithRetry(params, executionContext).finally(() => {
      stopped();
      return relay.close();
    });
    await params.sessionEventForwarder?.flush();
    const conversationStateUrl = await saveConversationState(params, result.newAcpSessionId, executionContext.agent);

    const documents = collectArtifacts(repoDir, snapshot);
    await restoreArtifactFiles(repoDir);
    const changedFiles = await listCodeChanges(repoDir);
    const turn: JobResult = {
      success: true,
      changedFiles,
      executionTime: 0,
      documents,
      conversationStateUrl,
      sessionStart: result.acpSessionStart,
      contextUsage: result.acpContextUsage,
      compacted: result.acpCompacted,
    };
    if (changedFiles.length === 0) return turn;

    if (!params.allowCode) {
      logger.info("Discarding code changes from a turn that wasn't asked for code", { jobId: data.id, changedFiles });
      await discardCodeChanges(repoDir);
      return { ...turn, changedFiles: [], codeDiscarded: true };
    }
    const delivered = await deliverPullRequest(params, {
      repoDir,
      checkoutBaseBranch,
      changedFiles,
      testsWereRequested: executionContext.runTests,
      taskBranch: setup.taskBranch,
    });
    return { ...turn, ...delivered };
  });
}

/** The worker's bundle puts the MCP server next to its entry point. */
function askHumanServerScript(): string {
  return path.join(__dirname, "ask-human-mcp.js");
}

/** Puts back the harness's saved home state, so it can continue its earlier session. */
async function restoreConversationState(params: JobRunnerParams): Promise<void> {
  if (!params.conversationStateUrl) return;
  await params.sendProgress("restore-state", "Restoring conversation state");
  try {
    await retrieveAndRestore(params.conversationStateUrl, os.homedir(), params.logger);
  } catch (err) {
    params.logger.warn("Failed to restore conversation state, continuing with fresh session", {
      conversationStateUrl: params.conversationStateUrl,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Saves the harness's home state for the next turn, and tells the platform its session id. */
async function saveConversationState(
  params: JobRunnerParams,
  acpSessionId: string | undefined,
  agent: string | undefined,
): Promise<string | undefined> {
  const { data, callbackClient, logger } = params;
  if (!acpSessionId) return undefined;
  await callbackClient.turn.sendAcpSessionId(data.id, data.tenantId, acpSessionId);
  try {
    const url = await captureAndStore(agent || "", params.agentSessionId || data.id, os.homedir(), logger);
    if (!url) {
      logger.warn("No conversation state to archive, or storing it failed", { jobId: data.id, agent });
      return undefined;
    }
    await callbackClient.turn.sendConversationStateUrl(data.id, data.tenantId, url);
    return url;
  } catch (err) {
    logger.warn("Failed to capture conversation state", {
      jobId: data.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
