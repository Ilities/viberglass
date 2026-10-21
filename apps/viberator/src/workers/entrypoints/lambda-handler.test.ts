import { handler } from "./lambda-handler";
import { ViberatorWorker } from "../core/ViberatorWorker";
import { LambdaPayload } from "../core/types";

const lambdaPayload: LambdaPayload = {
  workerType: "lambda",
  tenantId: "tenant-123",
  jobId: "job-123",
  jobKind: "execution",
  clankerId: "clanker-123",
  repository: "org/repo",
  task: "Fix the failing test",
  instructionFiles: [
    {
      fileType: "AGENTS.md",
      s3Url: "s3://test-bucket/AGENTS.md",
    },
  ],
  requiredCredentials: [],
};

describe("lambda-handler", () => {
  const initializeSpy = jest.spyOn(ViberatorWorker.prototype, "initialize");
  const executeTaskSpy = jest.spyOn(ViberatorWorker.prototype, "executeTask");

  beforeEach(() => {
    initializeSpy.mockReset();
    executeTaskSpy.mockReset();

    initializeSpy.mockResolvedValue(undefined);
    executeTaskSpy.mockResolvedValue({
      success: true,
      changedFiles: [],
      executionTime: 1,
    });
  });

  afterAll(() => {
    initializeSpy.mockRestore();
    executeTaskSpy.mockRestore();
  });

  test("processes a direct Lambda invocation payload", async () => {
    await handler(lambdaPayload);

    expect(initializeSpy).toHaveBeenCalledWith(lambdaPayload);
    expect(executeTaskSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: lambdaPayload.jobId,
        tenantId: lambdaPayload.tenantId,
        repository: lambdaPayload.repository,
        task: lambdaPayload.task,
      }),
    );
  });

  test("refuses a Files space's run clearly instead of losing its files", async () => {
    const { repository: _repository, ...withoutRepository } = lambdaPayload;
    const filesPayload = {
      ...withoutRepository,
      files: { spaceId: "space-1", baseSnapshotId: null, checkpointSnapshotId: "snapshot-1" },
    };

    await expect(handler(filesPayload)).rejects.toThrow("Files spaces can't run on Lambda workers");
    expect(executeTaskSpy).not.toHaveBeenCalled();
  });

  test("signs an agent in without a repository", async () => {
    await handler({ ...lambdaPayload, jobKind: "agent_login", repository: "", task: "Sign Codex in" });

    expect(executeTaskSpy).toHaveBeenCalledWith(expect.objectContaining({ jobKind: "agent_login", repository: "" }));
  });

  test("still needs a repository for any other run", async () => {
    await expect(handler({ ...lambdaPayload, repository: "" })).rejects.toThrow("Missing repository in payload");
    expect(executeTaskSpy).not.toHaveBeenCalled();
  });

  test("doesn't log the job's callback token", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await handler({ ...lambdaPayload, callbackToken: "secret-callback-token" });
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret-callback-token");
    } finally {
      log.mockRestore();
    }
  });

  test("rejects events that are not a direct invocation payload", async () => {
    await expect(handler({ Records: [{ body: JSON.stringify(lambdaPayload) }] })).rejects.toThrow(
      "Invalid Lambda payload in event",
    );
  });
});
