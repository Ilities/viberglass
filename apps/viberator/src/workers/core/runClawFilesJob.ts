import type { FilesWorkspacePayload } from "@viberglass/types";
import { ExecutionContext } from "../../types";
import { saveFilesWorkspace } from "../files/filesWorkspace";
import { savePartialFiles } from "../files/savePartialFiles";
import { unmaterialize } from "../runtime/InstructionFileManager";
import { onStop } from "../runtime/stopSignal";
import { executeAgentWithRetry } from "./agentExecution";
import { filesRunOf, JobRunnerParams, setupJob } from "./jobPipeline";
import { JobResult } from "./types";

/**
 * A scheduled run in a Files space. The agent works on the space's files,
 * which are saved when it finishes, with the artifacts it declared. A run
 * that fails or is stopped partway saves what it had, marked partial.
 */
export async function runClawFilesJob(params: JobRunnerParams, files: FilesWorkspacePayload): Promise<JobResult> {
  const { data, logger } = params;
  const setup = await setupJob(params, "claw");
  const { repoDir, mergedSettings, materializedFiles } = setup;
  const run = filesRunOf(params, files);

  let task = data.task;
  if (params.overrides?.additionalContext) task += `\n\nAdditional Context:\n${params.overrides.additionalContext}`;

  const executionContext: ExecutionContext = {
    repoUrl: "",
    branch: "",
    repoDir,
    commitHash: "",
    jobKind: data.jobKind,
    bugDescription: task,
    stepsToReproduce: "",
    expectedBehavior: "",
    actualBehavior: "",
    maxChanges: mergedSettings.maxChanges,
    testRequired: false,
    runTests: false,
    maxExecutionTime: mergedSettings.maxExecutionTime,
    promptOverride: task,
  };

  // A stopped run's space waits briefly for this save.
  const stopped = onStop(async () => {
    await savePartialFiles(run, repoDir, materializedFiles, logger);
  });
  await executeAgentWithRetry(params, executionContext)
    .catch(async (error: unknown) => {
      // A failed agent may still have done work worth keeping; the run fails either way.
      await savePartialFiles(run, repoDir, materializedFiles, logger);
      throw error;
    })
    .finally(stopped);

  await unmaterialize(materializedFiles);
  const filesSnapshot = await saveFilesWorkspace(run, repoDir, { partial: false });
  return { success: true, changedFiles: [], executionTime: 0, filesSnapshot };
}
