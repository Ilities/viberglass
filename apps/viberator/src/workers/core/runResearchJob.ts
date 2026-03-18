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
} from "./phasePrompts";

const RESEARCH_DOCUMENT_NAME = "RESEARCH.md";

export async function runResearchJob(
  params: JobRunnerParams,
): Promise<JobResult> {
  return withJobLifecycle(params, "Research", async () => {
    const { data, instructionFiles, sendProgress } = params;

    const setup = await setupJob(params, "research");
    const { repoDir, checkoutBaseBranch, mergedSettings } = setup;

    const systemPrompt =
      instructionFiles.get(RESEARCH_SYSTEM_PROMPT_KEY) ??
      DEFAULT_RESEARCH_SYSTEM_PROMPT;

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
      promptOverride: `${systemPrompt}\n\n${data.task}`,
    };

    const result = await executeAgentWithRetry(params, executionContext);

    await sendProgress("document", "Reading generated research document");
    const documentPath = path.join(repoDir, RESEARCH_DOCUMENT_NAME);
    if (!fs.existsSync(documentPath)) {
      throw new Error(`${RESEARCH_DOCUMENT_NAME} was not generated`);
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
