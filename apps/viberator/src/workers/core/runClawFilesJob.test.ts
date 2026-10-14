const mockSetupJob = jest.fn();
const mockFilesRunOf = jest.fn();
const mockExecute = jest.fn();
const mockSave = jest.fn();
const stopHandlers: Array<() => Promise<void>> = [];

jest.mock("./jobPipeline", () => ({ setupJob: mockSetupJob, filesRunOf: mockFilesRunOf }));
jest.mock("./agentExecution", () => ({ executeAgentWithRetry: mockExecute }));
jest.mock("../files/filesWorkspace", () => ({ saveFilesWorkspace: mockSave }));
jest.mock("../runtime/stopSignal", () => ({
  onStop: (handler: () => Promise<void>) => {
    stopHandlers.push(handler);
    return () => undefined;
  },
}));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { JobRunnerParams } from "./jobPipeline";
import { runClawFilesJob } from "./runClawFilesJob";

const FILES = { spaceId: "space-1", baseSnapshotId: "snapshot-1", checkpointSnapshotId: "snapshot-2" };
const SAVED = {
  id: "snapshot-2",
  parentId: "snapshot-1",
  fileCount: 2,
  totalBytes: 9,
  partial: false,
  changes: { added: 1, changed: 0, removed: 0 },
  createdAt: "now",
  artifacts: [{ artifactId: "a-1", versionId: "v-1", title: "Weekly report", number: 1, format: "html" }],
  artifactError: null,
};

let repoDir: string;

function params(): JobRunnerParams {
  return {
    data: { id: "claw_1", jobKind: "claw", tenantId: "space-1", task: "Write the weekly report", files: FILES, timestamp: 0 },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    sendProgress: jest.fn(async () => undefined),
  } as unknown as JobRunnerParams;
}

beforeEach(() => {
  jest.clearAllMocks();
  stopHandlers.length = 0;
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "files-claw-"));
  fs.writeFileSync(path.join(repoDir, "AGENTS.md"), "platform instructions");
  mockSetupJob.mockResolvedValue({
    jobWorkDir: path.dirname(repoDir),
    repoDir,
    checkoutBaseBranch: "main",
    mergedSettings: { maxChanges: 10, testRequired: false, runTests: false, maxExecutionTime: 60_000 },
    materializedFiles: [{ path: path.join(repoDir, "AGENTS.md"), previous: null, createdDirectories: [] }],
  });
  mockFilesRunOf.mockReturnValue({ jobId: "claw_1" });
  mockSave.mockResolvedValue(SAVED);
});

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

it("works on the space's files and saves them, with the artifacts it declared, instead of opening a pull request", async () => {
  mockExecute.mockImplementation(async () => {
    fs.writeFileSync(path.join(repoDir, "report.html"), "<h1>Week 41</h1>");
    return {};
  });

  const result = await runClawFilesJob(params(), FILES);

  expect(mockFilesRunOf).toHaveBeenCalledWith(expect.anything(), FILES);
  expect(mockExecute.mock.calls[0][1]).toMatchObject({ repoUrl: "", repoDir, jobKind: "claw", promptOverride: "Write the weekly report" });
  expect(mockSave).toHaveBeenCalledWith({ jobId: "claw_1" }, repoDir, { partial: false });
  // The platform's instruction file was taken out before saving.
  expect(fs.existsSync(path.join(repoDir, "AGENTS.md"))).toBe(false);
  expect(result).toEqual({ success: true, changedFiles: [], executionTime: 0, filesSnapshot: SAVED });
});

it("saves a failed agent's files as partial, then fails the run", async () => {
  mockExecute.mockRejectedValue(new Error("the agent gave up"));

  await expect(runClawFilesJob(params(), FILES)).rejects.toThrow("the agent gave up");
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockSave).toHaveBeenCalledWith({ jobId: "claw_1" }, repoDir, { partial: true });
});

it("still fails with the agent's error when saving its partial files fails too", async () => {
  mockExecute.mockRejectedValue(new Error("the agent gave up"));
  mockSave.mockRejectedValue(new Error("storage down"));

  await expect(runClawFilesJob(params(), FILES)).rejects.toThrow("the agent gave up");
});

it("saves the files as partial when the worker is stopped partway", async () => {
  mockExecute.mockImplementation(async () => {
    await stopHandlers[0]();
    return {};
  });

  await runClawFilesJob(params(), FILES);

  expect(mockSave).toHaveBeenNthCalledWith(1, { jobId: "claw_1" }, repoDir, { partial: true });
});

it("fails the run when the files can't be saved", async () => {
  mockExecute.mockResolvedValue({});
  mockSave.mockRejectedValue(new Error("Couldn't save the space's files: storage down"));

  await expect(runClawFilesJob(params(), FILES)).rejects.toThrow("Couldn't save the space's files");
});
