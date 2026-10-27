const mockSetupJob = jest.fn();
const mockExecute = jest.fn();
const mockListCodeChanges = jest.fn();
const mockDeliver = jest.fn();
const mockKeepPartialCode = jest.fn();
const mockKeptWorkNote = jest.fn();
const mockKeptWorkFiles = jest.fn();

jest.mock("./jobPipeline", () => ({ setupJob: mockSetupJob, filesRunOf: jest.fn() }));
jest.mock("./jobLifecycle", () => ({ withJobLifecycle: (_params: unknown, _label: string, run: () => Promise<unknown>) => run() }));
jest.mock("./agentExecution", () => ({ executeAgentWithRetry: mockExecute }));
jest.mock("./workingTreeChanges", () => ({
  listCodeChanges: mockListCodeChanges,
  discardCodeChanges: jest.fn(),
  restoreArtifactFiles: jest.fn(),
}));
jest.mock("./deliverPullRequest", () => ({ deliverPullRequest: mockDeliver }));
jest.mock("./peoplesChanges", () => ({ peoplesChanges: jest.fn(async () => null) }));
jest.mock("./keptWork", () => ({ keptWorkNote: mockKeptWorkNote, keptWorkFiles: mockKeptWorkFiles }));
jest.mock("./keepPartialWork", () => ({ keepPartialWork: jest.fn(), keepPartialCode: mockKeepPartialCode }));
jest.mock("../runtime/SessionStateManager", () => ({ captureAndStore: jest.fn(), retrieveAndRestore: jest.fn() }));
jest.mock("../runtime/stopSignal", () => ({ onStop: () => () => undefined }));
jest.mock("../../questions/QuestionRelay", () => ({
  QuestionRelay: jest.fn(() => ({ start: async () => ({ name: "ask_human" }), close: async () => undefined })),
}));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { JOB_FAILURE_CODE } from "@viberglass/types";
import { JobFailureError } from "./JobFailureError";
import type { JobRunnerParams } from "./jobPipeline";
import { runSessionTurnJob } from "./runSessionTurnJob";

const BRANCH = { name: "viberglass/t-1", continued: true };
let repoDir: string;

function params(overrides: Partial<JobRunnerParams> = {}): JobRunnerParams {
  return {
    data: { id: "job-1", jobKind: "execution", tenantId: "tenant-1", task: "Build it", context: {}, timestamp: 0 },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    sendProgress: jest.fn(async () => undefined),
    callbackClient: { turn: { sendQuestion: jest.fn() } },
    gitService: {},
    mcpServers: [],
    fetchedCredentials: {},
    allowCode: true,
    keptCommit: "wip123",
    ...overrides,
  } as unknown as JobRunnerParams;
}

beforeEach(() => {
  jest.clearAllMocks();
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "kept-turn-"));
  mockSetupJob.mockResolvedValue({
    repoDir,
    checkoutBaseBranch: "main",
    mergedSettings: { maxChanges: 10, testRequired: false, runTests: false, maxExecutionTime: 60_000 },
    taskBranch: BRANCH,
    materializedFiles: [],
  });
  mockExecute.mockResolvedValue({});
  mockListCodeChanges.mockResolvedValue([]);
  mockKeptWorkNote.mockResolvedValue("<kept-work>earlier work</kept-work>");
  mockKeptWorkFiles.mockResolvedValue(["app.js", "check.ts"]);
  mockDeliver.mockResolvedValue({ branch: BRANCH.name, pullRequestUrl: "https://github.com/o/r/pull/1", commitHash: "wip123", changedFiles: ["app.js", "check.ts"] });
});

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

it("tells the agent about the kept work before its task", async () => {
  await runSessionTurnJob(params());

  expect(mockKeptWorkNote).toHaveBeenCalledWith(repoDir, "wip123");
  expect(mockExecute.mock.calls[0][1].promptOverride).toMatch(/^<kept-work>earlier work<\/kept-work>\n\nBuild it/);
});

it("opens the pull request for kept work when the build changed nothing more", async () => {
  const result = await runSessionTurnJob(params());

  expect(mockKeptWorkFiles).toHaveBeenCalledWith(repoDir, "wip123", "origin/main");
  expect(mockDeliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ changedFiles: ["app.js", "check.ts"], taskBranch: BRANCH }));
  expect(result).toMatchObject({ pullRequestUrl: "https://github.com/o/r/pull/1", commitHash: "wip123" });
});

it("opens no pull request for a build that changed nothing and has no kept work", async () => {
  const result = await runSessionTurnJob(params({ keptCommit: undefined }));

  expect(mockDeliver).not.toHaveBeenCalled();
  expect(result.changedFiles).toEqual([]);
});

it("doesn't deliver kept work from a turn that wasn't asked for code", async () => {
  await runSessionTurnJob(params({ allowCode: false }));

  expect(mockKeptWorkFiles).not.toHaveBeenCalled();
  expect(mockDeliver).not.toHaveBeenCalled();
});

it("keeps a stalled build's code and fails with the commit it kept", async () => {
  mockExecute.mockRejectedValue(new JobFailureError(JOB_FAILURE_CODE.AGENT_STALLED, "Agent stalled: its harness sent nothing for 20 minutes"));
  mockKeepPartialCode.mockResolvedValue({ commitHash: "wip456", branch: BRANCH.name });

  const error = await runSessionTurnJob(params()).catch((e: unknown) => e);

  expect(mockKeepPartialCode).toHaveBeenCalledWith(expect.objectContaining({ allowCode: true }), repoDir, BRANCH);
  expect(error).toBeInstanceOf(JobFailureError);
  expect(error).toMatchObject({ code: JOB_FAILURE_CODE.AGENT_STALLED, kept: { commitHash: "wip456", branch: BRANCH.name } });
});

it("keeps nothing when the agent failed for another reason", async () => {
  mockExecute.mockRejectedValue(new JobFailureError(JOB_FAILURE_CODE.AGENT_FAILED, "the agent gave up"));

  await expect(runSessionTurnJob(params())).rejects.toThrow("the agent gave up");
  expect(mockKeepPartialCode).not.toHaveBeenCalled();
});
