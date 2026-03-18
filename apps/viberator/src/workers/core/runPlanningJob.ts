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
  PLANNING_SYSTEM_PROMPT_KEY,
  DEFAULT_PLANNING_SYSTEM_PROMPT,
} from "./phasePrompts";

const PLANNING_DOCUMENT_NAME = "PLAN.md";

export async function runPlanningJob(
  params: JobRunnerParams,
): Promise<JobResult> {
  return withJobLifecycle(params, "Planning", async () => {
    const { data, instructionFiles, sendProgress } = params;

    const setup = await setupJob(params, "planning");
    const { repoDir, checkoutBaseBranch, mergedSettings } = setup;

    const systemPrompt =
      instructionFiles.get(PLANNING_SYSTEM_PROMPT_KEY) ??
      DEFAULT_PLANNING_SYSTEM_PROMPT;

    const researchSection = data.context?.researchDocument?.trim()
      ? `\n\nResearch Document:\n${data.context.researchDocument}`
      : "";

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
      promptOverride: `${systemPrompt}\n\n${data.task}${researchSection}`,
    };

    const result = await executeAgentWithRetry(params, executionContext);

    await sendProgress("document", "Reading generated planning document");
    const documentPath = path.join(repoDir, PLANNING_DOCUMENT_NAME);
    if (!fs.existsSync(documentPath)) {
      throw new Error(`${PLANNING_DOCUMENT_NAME} was not generated`);
    }

    const documentContent = fs.readFileSync(documentPath, "utf-8");

    return {
      success: true,
      documentContent,
      changedFiles: result.changedFiles,
      executionTime: 0,
    };
  });
}
