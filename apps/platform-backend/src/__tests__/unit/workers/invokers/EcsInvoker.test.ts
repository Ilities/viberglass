/**
 * Unit tests for EcsInvoker error classification
 *
 * Tests:
 * - Failure reason classification (AGENT, CAPACITY = transient)
 * - Failure reason classification (RESOURCE, ATTRIBUTE = permanent)
 * - Missing clusterArn/taskDefinitionArn throws PERMANENT error
 * - ServerException classification (transient)
 * - ClusterNotFoundException classification (permanent)
 */

import { EcsInvoker } from "../../../../workers/invokers/EcsInvoker";
import {
  WorkerError,
  ErrorClassification,
} from "../../../../workers/errors/WorkerError";
import type { Clanker } from "@viberglass/types";
import type { JobData } from "../../../../types/Job";

// Mock the ECS client
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-ecs", () => ({
  ECSClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  RunTaskCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe("EcsInvoker", () => {
  let invoker: EcsInvoker;
  let mockJob: JobData;
  let mockClanker: Clanker;

  beforeEach(() => {
    jest.clearAllMocks();

    invoker = new EcsInvoker({ region: "eu-west-1" });

    // Setup mock job
    mockJob = {
      id: "job-123",
      tenantId: "tenant-abc",
      repository: "https://github.com/user/repo",
      task: "Fix the bug in auth module",
      branch: "fix/auth-bug",
      baseBranch: "main",
      context: {
        stepsToReproduce: "1. Login\n2. Click profile",
        expectedBehavior: "Profile loads",
        actualBehavior: "Error 500",
      },
      timestamp: Date.now(),
    };

    // Setup mock clanker with ECS config
    mockClanker = {
      id: "clanker-1",
      name: "ECS Fixer",
      slug: "ecs-fixer",
      description: "Fixes bugs via ECS",
      status: "active",
      agent: "kimi-code",
      configFiles: [],
      secretIds: [],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      deploymentConfig: {
        version: 1,
        strategy: {
          type: "ecs",
          clusterArn: "arn:aws:ecs:eu-west-1:123456789:cluster/viberator",
          taskDefinitionArn:
            "arn:aws:ecs:eu-west-1:123456789:task-definition/viberator-worker:1",
          subnetIds: ["subnet-123", "subnet-456"],
          securityGroupIds: ["sg-123"],
        },
        agent: {
          type: "kimi-code",
        },
      },
    };
  });

  describe("invoke() - error classification", () => {
    describe("transient failure reasons", () => {
      it("should classify AGENT failure reason as TRANSIENT", async () => {
        const response = {
          $metadata: {},
          failures: [
            {
              reason: "AGENT",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
            },
          ],
        };
        mockSend.mockResolvedValueOnce(response);

        const resultPromise = invoker.invoke(mockJob, mockClanker);

        await expect(resultPromise).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
          name: "WorkerError",
        });

        await expect(resultPromise).rejects.toThrow(
          /ECS task failed to start \(transient\)/,
        );
      });

      it("should classify CAPACITY failure reason as TRANSIENT", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [
            {
              reason: "CAPACITY",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
            },
          ],
        });

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it("should classify failure reason containing CAPACITY as TRANSIENT", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [
            {
              reason: "TASK_CAPACITY_LIMIT",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
            },
          ],
        });

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it("should include failure detail in error message", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [
            {
              reason: "AGENT",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
              detail: "ECS agent disconnected",
            },
          ],
        });

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toThrow(
          /AGENT.*ECS agent disconnected/,
        );
      });
    });

    describe("permanent failure reasons", () => {
      it("should classify RESOURCE failure reason as PERMANENT", async () => {
        const response = {
          $metadata: {},
          failures: [
            {
              reason: "RESOURCE",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
            },
          ],
        };
        mockSend.mockResolvedValueOnce(response);

        const resultPromise = invoker.invoke(mockJob, mockClanker);

        await expect(resultPromise).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
          name: "WorkerError",
        });

        await expect(resultPromise).rejects.toThrow(
          /ECS task failed to start \(permanent\)/,
        );
      });

      it("should classify ATTRIBUTE failure reason as PERMANENT", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [
            {
              reason: "ATTRIBUTE",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
            },
          ],
        });

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should classify MISSING failure reason as PERMANENT", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [
            {
              reason: "MISSING",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
            },
          ],
        });

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should classify INACTIVE failure reason as PERMANENT", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [
            {
              reason: "INACTIVE",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
            },
          ],
        });

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should classify unknown failure reason as PERMANENT (safe default)", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [
            {
              reason: "UNKNOWN_REASON",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
            },
          ],
        });

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should handle failure without reason", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [
            {
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-123",
            },
          ],
        });

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should handle failure without detail", async () => {
        const response = {
          $metadata: {},
          failures: [{ reason: "RESOURCE" }],
        };
        mockSend.mockResolvedValueOnce(response);

        const resultPromise = invoker.invoke(mockJob, mockClanker);

        await expect(resultPromise).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });

        await expect(resultPromise).rejects.toThrow(/RESOURCE.*undefined/);
      });
    });

    describe("API errors", () => {
      it("should classify ServerException as TRANSIENT", async () => {
        const error = new Error("Internal server error") as any;
        error.name = "ServerException";
        mockSend.mockRejectedValueOnce(error);

        const resultPromise = invoker.invoke(mockJob, mockClanker);

        await expect(resultPromise).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });

        await expect(resultPromise).rejects.toThrow(
          /ECS server error \(transient\)/,
        );
      });

      it("should classify ClusterNotFoundException as PERMANENT", async () => {
        const error = new Error("Cluster not found") as any;
        error.name = "ClusterNotFoundException";
        mockSend.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toThrow(
          /ECS invocation failed \(permanent\)/,
        );
      });

      it("should classify InvalidParameterException as PERMANENT", async () => {
        const error = new Error("Invalid parameter") as any;
        error.name = "InvalidParameterException";
        mockSend.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should classify unknown API errors as PERMANENT (safe default)", async () => {
        const error = new Error("Unknown error") as any;
        error.name = "UnknownException";
        mockSend.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should preserve original error in cause property", async () => {
        const originalError = new Error("Internal server error") as any;
        originalError.name = "ServerException";
        mockSend.mockRejectedValueOnce(originalError);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
          cause: originalError,
        });
      });
    });

    describe("configuration errors", () => {
      it("should throw PERMANENT error when clusterArn is missing", async () => {
        const clankerWithoutCluster: Clanker = {
          ...mockClanker,
          deploymentConfig: {
            version: 1,
            strategy: {
              type: "ecs",
              taskDefinitionArn:
                "arn:aws:ecs:eu-west-1:123456789:task-definition/viberator-worker:1",
              subnetIds: ["subnet-123"],
              securityGroupIds: ["sg-123"],
            },
            agent: {
              type: "kimi-code",
            },
          },
        };

        await expect(
          invoker.invoke(mockJob, clankerWithoutCluster),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
          name: "WorkerError",
        });

        await expect(
          invoker.invoke(mockJob, clankerWithoutCluster),
        ).rejects.toThrow(/ECS cluster ARN and task definition ARN required/);
      });

      it("should throw PERMANENT error when taskDefinitionArn is missing", async () => {
        const clankerWithoutTaskDef: Clanker = {
          ...mockClanker,
          deploymentConfig: {
            version: 1,
            strategy: {
              type: "ecs",
              clusterArn: "arn:aws:ecs:eu-west-1:123456789:cluster/viberator",
              subnetIds: ["subnet-123"],
              securityGroupIds: ["sg-123"],
            },
            agent: {
              type: "kimi-code",
            },
          },
        };

        await expect(
          invoker.invoke(mockJob, clankerWithoutTaskDef),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should throw PERMANENT error when deploymentConfig is null", async () => {
        const clankerWithNullConfig: Clanker = {
          ...mockClanker,
          deploymentConfig: null,
        };

        await expect(
          invoker.invoke(mockJob, clankerWithNullConfig),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should throw PERMANENT error when deploymentConfig is undefined", async () => {
        const clankerWithUndefinedConfig: Clanker = {
          ...mockClanker,
          deploymentConfig: undefined,
        };

        await expect(
          invoker.invoke(mockJob, clankerWithUndefinedConfig),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should throw PERMANENT error when both clusterArn and taskDefinitionArn are missing", async () => {
        const clankerWithEmptyConfig: Clanker = {
          ...mockClanker,
          deploymentConfig: {
            version: 1,
            strategy: {
              type: "ecs",
            },
            agent: {
              type: "kimi-code",
            },
          },
        };

        await expect(
          invoker.invoke(mockJob, clankerWithEmptyConfig),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });
    });

    describe("response edge cases", () => {
      it("should pass CLI job-data command override to ECS container", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          tasks: [
            {
              taskArn: "arn:aws:ecs:eu-west-1:123456789:task/viberator/abc123",
            },
          ],
          failures: [],
        });

        await invoker.invoke(mockJob, mockClanker);

        expect(mockSend).toHaveBeenCalledTimes(1);
        const runTaskInput = mockSend.mock.calls[0][0].input;
        const override = runTaskInput.overrides.containerOverrides[0];

        expect(override.name).toBe("worker");
        expect(override.command.slice(0, 3)).toEqual([
          "node",
          "dist/cli-worker.js",
          "--job-data",
        ]);

        const payload = JSON.parse(override.command[3]);
        expect(payload.workerType).toBe("docker");
        expect(payload.jobId).toBe(mockJob.id);
        expect(payload.tenantId).toBe(mockJob.tenantId);
        expect(payload.agent).toBe("kimi-code");
        expect(payload.repository).toBe(mockJob.repository);
        expect(payload.task).toBe(mockJob.task);
        expect(payload.requiredCredentials).toEqual([]);
        expect(payload.instructionFiles).toEqual([]);
      });

      it("should use job-ref command when bootstrap payload is available", async () => {
        const previousPlatformApiUrl = process.env.PLATFORM_API_URL;
        process.env.PLATFORM_API_URL = "https://platform.example.com";

        try {
          mockSend.mockResolvedValueOnce({
            $metadata: {},
            tasks: [
              {
                taskArn:
                  "arn:aws:ecs:eu-west-1:123456789:task/viberator/bootstrap",
              },
            ],
            failures: [],
          });

          const jobWithBootstrap: JobData = {
            ...mockJob,
            callbackToken: "cb-token-123",
            bootstrapPayload: {
              workerType: "docker",
              jobId: mockJob.id,
              tenantId: mockJob.tenantId,
            },
          };

          await invoker.invoke(jobWithBootstrap, mockClanker);

          const runTaskInput = mockSend.mock.calls[0][0].input;
          const override = runTaskInput.overrides.containerOverrides[0];

          expect(override.command).toEqual([
            "node",
            "dist/cli-worker.js",
            "--job-ref",
            mockJob.id,
          ]);
          expect(override.environment).toEqual(
            expect.arrayContaining([
              { name: "CALLBACK_TOKEN", value: "cb-token-123" },
            ]),
          );
        } finally {
          process.env.PLATFORM_API_URL = previousPlatformApiUrl;
        }
      });

      it("should throw TRANSIENT error when no task ARN returned", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          tasks: [],
          failures: [],
        });

        const resultPromise = invoker.invoke(mockJob, mockClanker);

        await expect(resultPromise).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
          name: "WorkerError",
        });

        await expect(resultPromise).rejects.toThrow(
          /ECS RunTask returned no task ARN/,
        );
      });

      it("should handle response with no tasks array", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [],
        });

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it("should handle success case with task ARN", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          tasks: [
            {
              taskArn: "arn:aws:ecs:eu-west-1:123456789:task/viberator/abc123",
            },
          ],
          failures: [],
        });

        const result = await invoker.invoke(mockJob, mockClanker);

        expect(result.executionId).toBe(
          "arn:aws:ecs:eu-west-1:123456789:task/viberator/abc123",
        );
        expect(result.workerType).toBe("ecs");
      });
    });

    describe("multiple failures", () => {
      it("should classify based on first failure reason", async () => {
        mockSend.mockResolvedValueOnce({
          $metadata: {},
          failures: [
            {
              reason: "AGENT",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-1",
            },
            {
              reason: "RESOURCE",
              arn: "arn:aws:ecs:eu-west-1:123456789:container-instance/task-2",
            },
          ],
        });

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });
    });
  });

  describe("name property", () => {
    it("should have correct invoker name", () => {
      expect(invoker.name).toBe("EcsInvoker");
    });
  });
});
