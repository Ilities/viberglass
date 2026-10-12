const mockPrepareFiles = jest.fn();

jest.mock("../files/filesWorkspace", () => ({ prepareFilesWorkspace: mockPrepareFiles }));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { setupJob, type JobRunnerParams } from "./jobPipeline";

let root: string;

function params(overrides: Partial<JobRunnerParams["data"]>): JobRunnerParams {
  return {
    data: { id: "job-1", jobKind: "reply", tenantId: "tenant-1", task: "Draft it", timestamp: 0, ...overrides },
    repositoryRoot: root,
    logger: { info: jest.fn(), warn: jest.fn() },
    logForwarder: { setupForJob: jest.fn() },
    environmentManager: { inject: jest.fn() },
    instructionFileManager: { materialize: jest.fn(async () => [{ path: "AGENTS.md", previous: null, createdDirectories: [] }]) },
    instructionFiles: new Map([["AGENTS.md", "instructions"]]),
    fetchedCredentials: {},
    defaultTimeout: 60_000,
    sendProgress: jest.fn(async () => undefined),
    callbackClient: { files: { storageGrant: jest.fn(), checkpoint: jest.fn() } },
    gitService: { getHeadSha: jest.fn() },
    cloneRepositoryToWorkspace: jest.fn(),
    allowCode: false,
    mcpServers: [],
    skills: [],
  } as unknown as JobRunnerParams;
}

beforeEach(() => {
  jest.clearAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "job-pipeline-files-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it("restores a Files space's files instead of cloning, and reports the instruction files it wrote", async () => {
  mockPrepareFiles.mockResolvedValue(path.join(root, "job-1", "repo"));
  const files = { spaceId: "space-1", baseSnapshotId: "snapshot-1", checkpointSnapshotId: "snapshot-2" };
  const run = params({ files });

  const setup = await setupJob(run, "session-turn");

  expect(mockPrepareFiles).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1", tenantId: "tenant-1", files }), path.join(root, "job-1"));
  expect(run.cloneRepositoryToWorkspace).not.toHaveBeenCalled();
  expect(run.gitService.getHeadSha).not.toHaveBeenCalled();
  expect(setup).toMatchObject({ repoDir: path.join(root, "job-1", "repo"), taskBranch: undefined });
  expect(setup.materializedFiles).toEqual([{ path: "AGENTS.md", previous: null, createdDirectories: [] }]);
});

it("refuses a run with neither a repository nor a Files space", async () => {
  await expect(setupJob(params({}), "session-turn")).rejects.toThrow("neither a repository nor a Files space");
  expect(mockPrepareFiles).not.toHaveBeenCalled();
});
