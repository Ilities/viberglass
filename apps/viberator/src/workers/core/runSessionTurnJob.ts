import * as os from "os";
import * as path from "path";
import { ExecutionContext } from "../../types";
import { JobResult } from "./types";
import { JobRunnerParams, filesRunOf, setupJob } from "./jobPipeline";
import { saveFilesWorkspace } from "../files/filesWorkspace";
import { savePartialFiles } from "../files/savePartialFiles";
import { unmaterialize } from "../runtime/InstructionFileManager";
import { executeAgentWithRetry } from "./agentExecution";
import { withJobLifecycle } from "./jobLifecycle";
import { captureAndStore, retrieveAndRestore } from "../runtime/SessionStateManager";
import { deliverPullRequest } from "./deliverPullRequest";
import { collectArtifacts, materializeArtifacts } from "./turnArtifacts";
import { discardCodeChanges, listCodeChanges, restoreArtifactFiles } from "./workingTreeChanges";
import { QuestionRelay } from "../../questions/QuestionRelay";
import { httpMcpServersOf } from "../runtime/workerMcpServers";
import { peoplesChanges } from "./peoplesChanges";
import { keepPartialCode, keepPartialWork } from "./keepPartialWork";
import { keptWorkFiles, keptWorkNote } from "./keptWork";
import { JobFailureError } from "./JobFailureError";
import { JOB_FAILURE_CODE } from "@viberglass/types";
import { onStop } from "../runtime/stopSignal";
import { localTaskMedia, taskMediaDir, withTaskMedia } from "./taskMedia";

/**
 * One turn of a task's conversation with its agent. The agent gets
 * the task's documents as files to revise, and its earlier session when the
 * harness can continue one. Afterwards the turn reports what it produced: the
 * documents it wrote, and its code changes as a commit on the task's pull
 * request when it was allowed to write code, else thrown away. In a Files
 * space it saves the space's files instead, whatever the turn was asked for.
 */
export async function runSessionTurnJob(params: JobRunnerParams): Promise<JobResult> {
  return withJobLifecycle(params, "Session turn", async () => {
    const { data, logger, sendProgress } = params;
    params.sessionEventForwarder?.setupForJob(data.id, data.tenantId);

    const setup = await setupJob(params, "session-turn");
    const { repoDir, checkoutBaseBranch, mergedSettings } = setup;
    await restoreConversationState(params);
    const files = data.files ? filesRunOf(params, data.files) : null;
    const continued = setup.taskBranch?.continued ?? false;
    const kept = continued && params.keptCommit ? await keptWorkNote(repoDir, params.keptCommit) : null;
    const pushed = continued ? await peoplesChanges(repoDir, params.lastAgentCommit ?? `origin/${checkoutBaseBranch}`) : null;
    const preface = [kept, pushed].filter(Boolean).join("\n\n");
    const media = await localTaskMedia(data.context?.ticketMedia || [], taskMediaDir(repoDir), logger);
    const withPushed = (prompt: string | undefined) =>
      withTaskMedia(prompt && preface ? `${preface}\n\n${prompt}` : prompt, media);
    const snapshot = materializeArtifacts(repoDir, {
      plan: data.context?.planDocument,
      summary: data.context?.summaryDocument,
    });

    const executionContext: ExecutionContext = {
      // A Files run has no repository; its prompt comes from the platform and doesn't name one.
      repoUrl: data.repository ?? "",
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
      gitAuth: params.gitAuth,
      git: params.gitService,
      callbacks: params.callbackClient.turn,
      logger,
    };
    const stopped = onStop(async () => {
      // A stopped Files run's space waits briefly for this save, so it goes first.
      const filesSaved = files ? await savePartialFiles(files, repoDir, setup.materializedFiles, logger) : false;
      await keepPartialWork(partialRun, { repoDir, snapshot, taskBranch: setup.taskBranch, filesSaved });
    });
    await sendProgress("execute", "Running ACP agent turn");
    const relay = new QuestionRelay(
      { sendQuestion: (question) => params.callbackClient.turn.sendQuestion(data.id, data.tenantId, question) },
      askHumanServerScript(),
    );
    executionContext.mcpServers = [await relay.start(), ...httpMcpServersOf(params.mcpServers, params.fetchedCredentials, logger)];
    const result = await executeAgentWithRetry(params, executionContext)
      .catch(async (error: unknown) => {
        // A failed agent may still have done work worth keeping; the run fails either way.
        if (files) await savePartialFiles(files, repoDir, setup.materializedFiles, logger);
        // A stalled build is kept like a stopped one, so the next turn carries on from it.
        if (!files && error instanceof JobFailureError && error.code === JOB_FAILURE_CODE.AGENT_STALLED) {
          const code = await keepPartialCode(partialRun, repoDir, setup.taskBranch);
          if (code) throw new JobFailureError(error.code, error.message, code);
        }
        throw error;
      })
      .finally(() => {
        stopped();
        return relay.close();
      });
    await params.sessionEventForwarder?.flush();
    const conversationStateUrl = await saveConversationState(params, result.newAcpSessionId, executionContext.agent);

    const documents = collectArtifacts(repoDir, snapshot);
    if (files) {
      await unmaterialize(setup.materializedFiles);
      const filesSnapshot = await saveFilesWorkspace(files, repoDir, { partial: false });
      return {
        success: true,
        changedFiles: [],
        executionTime: 0,
        documents,
        conversationStateUrl,
        sessionStart: result.acpSessionStart,
        contextUsage: result.acpContextUsage,
        compacted: result.acpCompacted,
        filesSnapshot,
      };
    }
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
    const keptFiles = changedFiles.length === 0 ? await keptWorkToDeliver(params, repoDir, checkoutBaseBranch) : null;
    if (changedFiles.length === 0 && !keptFiles) return turn;

    if (!params.allowCode) {
      logger.info("Discarding code changes from a turn that wasn't asked for code", { jobId: data.id, changedFiles });
      await discardCodeChanges(repoDir);
      return { ...turn, changedFiles: [], codeDiscarded: true };
    }
    if (!setup.taskBranch) throw new Error("The platform named no branch for this task, so the build has nowhere to go");
    if (keptFiles) logger.info("Delivering the work an earlier run kept", { jobId: data.id, keptCommit: params.keptCommit });
    const delivered = await deliverPullRequest(params, {
      repoDir,
      checkoutBaseBranch,
      changedFiles: keptFiles ?? changedFiles,
      testsWereRequested: executionContext.runTests,
      taskBranch: setup.taskBranch,
    });
    return { ...turn, ...delivered };
  });
}

/**
 * A build that changed nothing still opens the pull request when the branch
 * carries a stopped turn's kept work, which only a pull request delivers.
 */
async function keptWorkToDeliver(params: JobRunnerParams, repoDir: string, baseBranch: string): Promise<string[] | null> {
  if (!params.allowCode || !params.keptCommit) return null;
  const files = await keptWorkFiles(repoDir, params.keptCommit, `origin/${baseBranch}`);
  return files && files.length > 0 ? files : null;
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
    await retrieveAndRestore(params.conversationStateUrl, os.homedir(), params.logger, params.objectStorage);
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
    const url = await captureAndStore(agent || "", params.agentSessionId || data.id, os.homedir(), logger, params.objectStorage);
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
