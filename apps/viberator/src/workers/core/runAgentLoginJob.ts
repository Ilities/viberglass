import { JOB_FAILURE_CODE } from "@viberglass/types";
import { failingWith } from "./JobFailureError";
import type { JobRunnerParams } from "./jobPipeline";
import { withJobLifecycle } from "./jobLifecycle";
import type { JobResult } from "./types";

/**
 * Signs the runner's agent in and stores the login, without cloning or running
 * anything: the "Connect" action on a runner. The agent's auth lifecycle reports
 * the device code as progress and uploads the login when it completes.
 */
export async function runAgentLoginJob(params: JobRunnerParams & { agentName: string }): Promise<JobResult> {
  return withJobLifecycle(params, "Agent login", async () => {
    await params.sendProgress("auth", "Starting agent login", { agentName: params.agentName });
    await failingWith(JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID, () =>
      params.agentAuthLifecycle.login({
        agentName: params.agentName,
        jobId: params.data.id,
        tenantId: params.data.tenantId,
      }),
    );
    return { success: true, changedFiles: [], executionTime: 0 };
  });
}
