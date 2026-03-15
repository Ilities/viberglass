import { ExecutionContext } from "../../types";
import { JobResult } from "./types";
import {
  JobRunnerParams,
  setupJob,
  executeAgentWithRetry,
  withJobLifecycle,
} from "./jobPipeline";

export async function runSessionTurnJob(
  params: JobRunnerParams,
): Promise<JobResult> {
  return withJobLifecycle(params, "Session turn", async () => {
    const { data, callbackClient, sendProgress } = params;

    params.sessionEventForwarder?.setupForJob(data.id, data.tenantId);

    const setup = await setupJob(params, "session-turn");
    const { repoDir, checkoutBaseBranch, mergedSettings } = setup;

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
      promptOverride: data.task,
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
    return { success: true, changedFiles, executionTime: 0 };
  });
}
