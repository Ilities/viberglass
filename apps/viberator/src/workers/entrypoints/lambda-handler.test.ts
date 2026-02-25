import { handler } from "./lambda-handler";
import { ViberatorWorker } from "../core/ViberatorWorker";
import { LambdaPayload } from "../core/types";

const lambdaPayload: LambdaPayload = {
  workerType: "lambda",
  tenantId: "tenant-123",
  jobId: "job-123",
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

  test("processes an SQS event payload", async () => {
    await handler({
      Records: [{ body: JSON.stringify(lambdaPayload) }],
    });

    expect(initializeSpy).toHaveBeenCalledWith(lambdaPayload);
    expect(executeTaskSpy).toHaveBeenCalledTimes(1);
  });

  test("processes a body-wrapped payload", async () => {
    await handler({
      body: JSON.stringify(lambdaPayload),
    });

    expect(initializeSpy).toHaveBeenCalledWith(lambdaPayload);
    expect(executeTaskSpy).toHaveBeenCalledTimes(1);
  });

  test("throws on invalid payload shape", async () => {
    await expect(handler({ Records: {} })).rejects.toThrow(
      "Invalid Lambda payload in event",
    );
  });
});
