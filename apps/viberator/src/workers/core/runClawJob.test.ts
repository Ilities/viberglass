const mockSetupJob = jest.fn();

jest.mock("./jobPipeline", () => ({ setupJob: mockSetupJob }));
jest.mock("./jobLifecycle", () => ({ withJobLifecycle: (_params: unknown, _label: string, run: () => Promise<unknown>) => run() }));
jest.mock("./agentExecution", () => ({ executeAgentWithRetry: jest.fn(async () => ({})) }));
jest.mock("./runClawFilesJob", () => ({ runClawFilesJob: jest.fn() }));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { JobRunnerParams } from "./jobPipeline";
import { runClawJob } from "./runClawJob";

const PROMPT = "You are an expert software engineer. Complete the scheduled task described below.\n\n<task-instructions>\nUpdate dependencies\n</task-instructions>";

let repoDir: string;
let commitChanges: jest.Mock;
let openPullRequest: jest.Mock;

function params(context: Record<string, unknown>): JobRunnerParams {
  commitChanges = jest.fn(async () => "abc123");
  openPullRequest = jest.fn(async () => "https://github.com/acme/app/pull/4");
  return {
    data: { id: "claw_1", jobKind: "claw", tenantId: "t-1", repository: "https://github.com/acme/app", task: PROMPT, context, timestamp: 0 },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    sendProgress: jest.fn(async () => undefined),
    gitService: {
      createBranch: jest.fn(async () => undefined),
      getChangedFiles: jest.fn(async () => ["package.json"]),
      commitChanges,
      pushBranch: jest.fn(async () => undefined),
    },
    callbackClient: { repository: { openPullRequest } },
  } as unknown as JobRunnerParams;
}

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-job-"));
  mockSetupJob.mockResolvedValue({
    repoDir,
    checkoutBaseBranch: "main",
    mergedSettings: { maxChanges: 10, testRequired: false, runTests: false, maxExecutionTime: 60_000 },
  });
});

describe("runClawJob", () => {
  it("commits and opens the pull request under the agent's title, never the prompt", async () => {
    fs.writeFileSync(path.join(repoDir, "PR_TITLE.md"), "chore: update minor and patch dependencies\n");
    fs.writeFileSync(path.join(repoDir, "PR_DESCRIPTION.md"), "## Summary\n29 packages updated.\n");

    await runClawJob(params({ clawTemplateName: "Update dependencies" }));

    expect(commitChanges).toHaveBeenCalledWith(repoDir, "chore: update minor and patch dependencies");
    const pullRequest = openPullRequest.mock.calls[0][2];
    expect(pullRequest.title).toBe("chore: update minor and patch dependencies");
    expect(pullRequest.body).toContain("29 packages updated.");
  });

  it("falls back to the task template's name, leaving the prompt out of the description", async () => {
    await runClawJob(params({ clawTemplateName: "Update dependencies" }));

    expect(commitChanges).toHaveBeenCalledWith(repoDir, "Update dependencies");
    const pullRequest = openPullRequest.mock.calls[0][2];
    expect(pullRequest.title).toBe("Update dependencies");
    expect(pullRequest.body).toContain("## Summary\nUpdate dependencies");
    expect(pullRequest.body).toContain("`package.json`");
    expect(pullRequest.body).not.toContain("expert software engineer");
  });

  it("names it a scheduled task when the run has no template name", async () => {
    await runClawJob(params({}));

    expect(commitChanges).toHaveBeenCalledWith(repoDir, "Scheduled task");
  });
});
