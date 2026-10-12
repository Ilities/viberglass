const mockSetupJob = jest.fn();
const mockFilesRunOf = jest.fn();
const mockExecute = jest.fn();
const mockSave = jest.fn();
const mockListCodeChanges = jest.fn();
const mockDiscard = jest.fn();
const mockDeliver = jest.fn();

jest.mock("./jobPipeline", () => ({ setupJob: mockSetupJob, filesRunOf: mockFilesRunOf }));
jest.mock("./jobLifecycle", () => ({ withJobLifecycle: (_params: unknown, _label: string, run: () => Promise<unknown>) => run() }));
jest.mock("./agentExecution", () => ({ executeAgentWithRetry: mockExecute }));
jest.mock("../files/filesWorkspace", () => ({ saveFilesWorkspace: mockSave }));
jest.mock("./workingTreeChanges", () => ({
  listCodeChanges: mockListCodeChanges,
  discardCodeChanges: mockDiscard,
  restoreArtifactFiles: jest.fn(),
}));
jest.mock("./deliverPullRequest", () => ({ deliverPullRequest: mockDeliver }));
jest.mock("../runtime/SessionStateManager", () => ({ captureAndStore: jest.fn(), retrieveAndRestore: jest.fn() }));
jest.mock("../runtime/stopSignal", () => ({ onStop: () => () => undefined }));
jest.mock("../../questions/QuestionRelay", () => ({
  QuestionRelay: jest.fn(() => ({ start: async () => ({ name: "ask_human" }), close: async () => undefined })),
}));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { JobRunnerParams } from "./jobPipeline";
import { runSessionTurnJob } from "./runSessionTurnJob";

const SAVED = {
  id: "snapshot-2",
  parentId: null,
  fileCount: 1,
  totalBytes: 5,
  partial: false,
  changes: { added: 1, changed: 0, removed: 0 },
  createdAt: "now",
  artifacts: [],
  artifactError: null,
};

let repoDir: string;

function params(): JobRunnerParams {
  return {
    data: {
      id: "job-1",
      jobKind: "reply",
      tenantId: "tenant-1",
      task: "Draft the outline",
      files: { spaceId: "space-1", baseSnapshotId: null, checkpointSnapshotId: "snapshot-2" },
      context: { planDocument: "# Plan" },
      timestamp: 0,
    },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    sendProgress: jest.fn(async () => undefined),
    callbackClient: { turn: { sendQuestion: jest.fn() } },
    mcpServers: [],
    fetchedCredentials: {},
    allowCode: false,
  } as unknown as JobRunnerParams;
}

beforeEach(() => {
  jest.clearAllMocks();
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "files-turn-"));
  fs.writeFileSync(path.join(repoDir, "AGENTS.md"), "platform instructions");
  mockSetupJob.mockResolvedValue({
    jobWorkDir: path.dirname(repoDir),
    repoDir,
    checkoutBaseBranch: "main",
    mergedSettings: { maxChanges: 1, testRequired: false, runTests: false, maxExecutionTime: 60_000 },
    taskBranch: undefined,
    materializedFiles: [{ path: path.join(repoDir, "AGENTS.md"), previous: null, createdDirectories: [] }],
  });
  mockFilesRunOf.mockReturnValue({ jobId: "job-1" });
  mockSave.mockResolvedValue(SAVED);
});

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

it("saves the space's files instead of looking for code changes", async () => {
  mockExecute.mockImplementation(async () => {
    fs.writeFileSync(path.join(repoDir, "PLAN.md"), "# Plan\n\nRevised");
    fs.writeFileSync(path.join(repoDir, "outline.md"), "slide");
    return {};
  });

  const result = await runSessionTurnJob(params());

  expect(result).toMatchObject({ success: true, changedFiles: [], filesSnapshot: SAVED, documents: { plan: "# Plan\n\nRevised" } });
  expect(mockSave).toHaveBeenCalledWith({ jobId: "job-1" }, repoDir, { partial: false });
  // The platform's instruction file was taken out before saving.
  expect(fs.existsSync(path.join(repoDir, "AGENTS.md"))).toBe(false);
  expect(mockListCodeChanges).not.toHaveBeenCalled();
  expect(mockDiscard).not.toHaveBeenCalled();
  expect(mockDeliver).not.toHaveBeenCalled();
  expect(mockExecute.mock.calls[0][1]).toMatchObject({ repoUrl: "", repoDir });
});

it("saves a failed agent's files as partial, then fails the run", async () => {
  mockExecute.mockRejectedValue(new Error("the agent gave up"));

  await expect(runSessionTurnJob(params())).rejects.toThrow("the agent gave up");
  expect(mockSave).toHaveBeenCalledWith({ jobId: "job-1" }, repoDir, { partial: true });
});

it("still fails with the agent's error when saving its partial files fails too", async () => {
  mockExecute.mockRejectedValue(new Error("the agent gave up"));
  mockSave.mockRejectedValue(new Error("storage down"));

  await expect(runSessionTurnJob(params())).rejects.toThrow("the agent gave up");
});

it("fails the run when the files can't be saved", async () => {
  mockExecute.mockResolvedValue({});
  mockSave.mockRejectedValue(new Error("Couldn't save the space's files: storage down"));

  await expect(runSessionTurnJob(params())).rejects.toThrow("Couldn't save the space's files");
});
