import type { ReleaseBuildPayload } from "@viberglass/types";
import { buildRelease } from "../release/buildRelease";
import type { JobRunnerParams } from "./jobPipeline";
import { withJobLifecycle } from "./jobLifecycle";
import { jobWorkspaceDir } from "./taskWorkspace";
import type { JobResult } from "./types";

/** Builds one commit of an App space's app into a release bundle; no agent runs. */
export async function runBuildReleaseJob(params: JobRunnerParams & { release: ReleaseBuildPayload }): Promise<JobResult> {
  return withJobLifecycle(params, "Release build", async () => {
    if (!params.data.repository) throw new Error("A release build needs the repository");
    await buildRelease({
      jobId: params.data.id,
      tenantId: params.data.tenantId,
      repository: params.data.repository,
      release: params.release,
      workDir: jobWorkspaceDir(params.repositoryRoot, params.data),
      gitAuth: params.gitAuth,
      git: params.gitService,
      client: params.callbackClient.release,
      sendProgress: params.sendProgress,
    });
    return { success: true, changedFiles: [], executionTime: 0, commitHash: params.release.commitSha };
  });
}
