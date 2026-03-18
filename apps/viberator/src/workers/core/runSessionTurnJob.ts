import * as fs from "fs";
import * as path from "path";
import { ExecutionContext } from "../../types";
import { JobResult } from "./types";
import {
  JobRunnerParams,
  setupJob,
  executeAgentWithRetry,
  withJobLifecycle,
} from "./jobPipeline";

import {
  RESEARCH_SYSTEM_PROMPT_KEY,
  DEFAULT_RESEARCH_SYSTEM_PROMPT,
  PLANNING_SYSTEM_PROMPT_KEY,
  DEFAULT_PLANNING_SYSTEM_PROMPT,
} from "./phasePrompts";

const DOCUMENT_FILES: Record<string, string> = {
  research: "RESEARCH.md",
  planning: "PLAN.md",
};

function buildSessionPromptOverride(params: JobRunnerParams): string {
  const { data, instructionFiles, sessionMode, acpSessionId } = params;

  // Continuation turns: ACP session already has context, just send the user message
  if (acpSessionId) {
    return data.task;
  }

  // First turn of a research session: include the research system prompt + existing doc if revising
  if (sessionMode === "research") {
    const systemPrompt =
      instructionFiles.get(RESEARCH_SYSTEM_PROMPT_KEY) ??
      DEFAULT_RESEARCH_SYSTEM_PROMPT;
    const existingDocSection = data.context?.researchDocument?.trim()
      ? `\n\nExisting Research Document (revise based on the feedback below):\n${data.context.researchDocument}`
      : "";
    return `${systemPrompt}\n\n${data.task}${existingDocSection}`;
  }

  // First turn of a planning session: include the planning system prompt + research document + existing plan if revising
  if (sessionMode === "planning") {
    const systemPrompt =
      instructionFiles.get(PLANNING_SYSTEM_PROMPT_KEY) ??
      DEFAULT_PLANNING_SYSTEM_PROMPT;
    const researchSection = data.context?.researchDocument?.trim()
      ? `\n\nResearch Document:\n${data.context.researchDocument}`
      : "";
    const existingPlanSection = data.context?.planDocument?.trim()
      ? `\n\nExisting Planning Document (revise based on the feedback below):\n${data.context.planDocument}`
      : "";
    return `${systemPrompt}\n\n${data.task}${researchSection}${existingPlanSection}`;
  }

  return data.task;
}

export async function runSessionTurnJob(
  params: JobRunnerParams,
): Promise<JobResult> {
  return withJobLifecycle(params, "Session turn", async () => {
    const { data, callbackClient, sendProgress } = params;

    params.sessionEventForwarder?.setupForJob(data.id, data.tenantId);

    const setup = await setupJob(params, "session-turn");
    const { repoDir, checkoutBaseBranch, mergedSettings } = setup;

    const promptOverride = buildSessionPromptOverride(params);

    const executionContext: ExecutionContext = {
      repoUrl: data.repository,
      branch: checkoutBaseBranch,
      baseBranch: checkoutBaseBranch,
      repoDir,
      commitHash: "",
      bugDescription: data.task,
      stepsToReproduce: "",
      expectedBehavior: "",
      actualBehavior: "",
      maxChanges: mergedSettings.maxChanges,
      testRequired: false,
      runTests: false,
      maxExecutionTime: mergedSettings.maxExecutionTime,
      promptOverride,
      agentSessionId: params.agentSessionId,
      acpSessionId: params.acpSessionId,
      onAcpEvent: (event) => params.sessionEventForwarder?.enqueue(event),
    };

    await sendProgress("execute", "Running ACP agent turn");
    const result = await executeAgentWithRetry(params, executionContext);

    await params.sessionEventForwarder?.flush();

    if (result.newAcpSessionId) {
      await callbackClient.sendAcpSessionId(
        data.id,
        data.tenantId,
        result.newAcpSessionId,
      );
    }

    const changedFiles = await params.gitService.getChangedFiles(repoDir);

    // For document modes (research/planning), read the generated document if present.
    // If the file exists the backend will save it and mark the session completed.
    // If not, the turn completes normally and the session stays active for follow-up.
    let documentContent: string | undefined;
    const documentFileName = params.sessionMode ? DOCUMENT_FILES[params.sessionMode] : undefined;
    if (documentFileName) {
      const documentPath = path.join(repoDir, documentFileName);
      if (fs.existsSync(documentPath)) {
        documentContent = fs.readFileSync(documentPath, "utf-8");
      }
    }

    return { success: true, changedFiles, executionTime: 0, documentContent };
  });
}
