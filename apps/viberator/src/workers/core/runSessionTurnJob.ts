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


const DOCUMENT_FILES: Record<string, string> = {
  research: "RESEARCH.md",
  planning: "PLAN.md",
};

function buildSessionPromptOverride(params: JobRunnerParams): string {
  const { data, sessionMode, acpSessionId } = params;

  // Continuation turns: ACP session already has context, just send the user message
  if (acpSessionId) {
    return data.task;
  }

  // First turn of a research session: data.task already contains the full research prompt
  // (agent instructions + ticket content, from the ticket_research template).
  // Append any existing research document for revision sessions.
  if (sessionMode === "research") {
    const existingDocSection = data.context?.researchDocument?.trim()
      ? `\n\nExisting Research Document (revise based on the feedback below):\n${data.context.researchDocument}`
      : "";
    return `${data.task}${existingDocSection}`;
  }

  // First turn of a planning session: data.task already contains the full planning prompt
  // (agent instructions + ticket content + research doc, from the ticket_planning_* template).
  // Append any existing plan document for revision sessions.
  if (sessionMode === "planning") {
    const existingPlanSection = data.context?.planDocument?.trim()
      ? `\n\nExisting Planning Document (revise based on the feedback below):\n${data.context.planDocument}`
      : "";
    return `${data.task}${existingPlanSection}`;
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
