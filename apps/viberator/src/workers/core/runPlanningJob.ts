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

const PLANNING_DOCUMENT_NAME = "PLAN.md";

export async function runPlanningJob(
  params: JobRunnerParams,
): Promise<JobResult> {
  return withJobLifecycle(params, "Planning", async () => {
    const { data, sendProgress, cleanupWorkspace } = params;

    const setup = await setupJob(params, "planning");
    const { repoDir, jobWorkDir, checkoutBaseBranch, mergedSettings } = setup;

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
      maxChanges: mergedSettings.maxChanges ?? 1,
      testRequired: false,
      runTests: false,
      maxExecutionTime: mergedSettings.maxExecutionTime,
      promptOverride: data.task,
    };

    const result = await executeAgentWithRetry(params, executionContext);

    await sendProgress("document", "Reading generated planning document");
    const documentPath = path.join(repoDir, PLANNING_DOCUMENT_NAME);
    if (!fs.existsSync(documentPath)) {
      throw new Error(`${PLANNING_DOCUMENT_NAME} was not generated`);
    }

    const documentContent = fs.readFileSync(documentPath, "utf-8");
    await sendProgress("cleanup", "Cleaning up workspace");
    cleanupWorkspace(jobWorkDir);

    return {
      success: true,
      documentContent,
      changedFiles: result.changedFiles,
      executionTime: 0,
    };
  });
}
