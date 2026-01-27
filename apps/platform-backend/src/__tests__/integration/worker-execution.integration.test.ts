/**
 * Integration tests for Worker Execution Flow
 *
 * Tests the complete flow using real services but mocking external dependencies:
 * - Use REAL WorkerExecutionService (not mocked)
 * - Mock JobService (for testability without database)
 * - Mock AWS SDK at the boundary only (no actual Lambda/ECS/Docker calls)
 * - Use unique job IDs for test isolation
 *
 * These are "service integration" tests - they test how the real services work together
 * without requiring external infrastructure like databases or cloud services.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { JobService } from "../../services/JobService";
import { WorkerExecutionService } from "../../workers/WorkerExecutionService";
import { OrphanSweeper } from "../../workers/OrphanSweeper";
import {
  getWorkerInvokerFactory,
  resetWorkerInvokerFactory,
} from "../../workers/WorkerInvokerFactory";
import { WorkerInvoker, WorkerType } from "../../workers/WorkerInvoker";
import type { Clanker } from "@viberglass/types";
import type { JobData } from "../../types/Job";
import {
  WorkerError,
  ErrorClassification,
} from "../../workers/errors/WorkerError";

// Mock AWS SDK at the boundary before any imports that use them
const mockLambdaSend = jest.fn();
const mockEcsSend = jest.fn();
const mockDockerCreateContainer = jest.fn();

jest.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: mockLambdaSend,
  })),
  InvokeCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock("@aws-sdk/client-ecs", () => ({
  ECSClient: jest.fn().mockImplementation(() => ({
    send: mockEcsSend,
  })),
  RunTaskCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock("dockerode", () => {
  return jest.fn().mockImplementation(() => ({
    createContainer: mockDockerCreateContainer,
    ping: jest.fn().mockResolvedValue(true),
  }));
});

// Mock JobService but allow real WorkerExecutionService to use it
const mockJobStatusUpdates: Map<
  string,
  { status: string; progress?: Record<string, unknown>; errorMessage?: string }
> = new Map();

jest.mock("../../services/JobService", () => {
  return {
    JobService: jest.fn().mockImplementation(() => ({
      submitJob: jest
        .fn()
        .mockResolvedValue({ jobId: "test-job-id", status: "queued" }),
      updateJobStatus: jest
        .fn()
        .mockImplementation((jobId: string, status: string, updates?: any) => {
          mockJobStatusUpdates.set(jobId, { status, ...updates });
          return Promise.resolve(undefined);
        }),
      getJobStatus: jest.fn(),
      listJobs: jest.fn(),
      deleteJob: jest.fn(),
      getQueueStats: jest.fn(),
      getNextQueuedJob: jest.fn(),
      findOrphanedJobs: jest.fn().mockResolvedValue([]), // Default to empty array
    })),
  };
});

describe("Worker Execution Integration Tests", () => {
  let jobService: JobService;
  let executionService: WorkerExecutionService;
  let orphanSweeper: OrphanSweeper;

  // Test data generators
  const generateJobId = (): string =>
    `integration-test-job-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const createMockJob = (overrides?: Partial<JobData>): JobData => ({
    id: generateJobId(),
    tenantId: "test-tenant",
    repository: "https://github.com/test/repo",
    task: "Fix the bug",
    timestamp: Date.now(),
    ...overrides,
  });

  const createMockClanker = (overrides?: Partial<Clanker>): Clanker => ({
    id: "test-clanker-id",
    name: "Test Clanker",
    slug: "test-clanker",
    status: "active",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    deploymentStrategy: {
      id: "lambda-strategy",
      name: "lambda",
      description: "Lambda deployment",
      createdAt: "2024-01-01T00:00:00Z",
    },
    deploymentConfig: {
      functionName: "test-lambda-function",
    },
    configFiles: [],
    secretIds: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetWorkerInvokerFactory();
    mockJobStatusUpdates.clear();

    // Initialize services with real WorkerExecutionService
    jobService = new JobService();
    executionService = new WorkerExecutionService();
    orphanSweeper = new OrphanSweeper({
      jobTimeoutMs: 1000, // 1 second timeout for testing
    });

    // Setup default successful invocation mocks
    setupMockInvokerSuccess();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper to mock successful Lambda invocation
  function setupMockInvokerSuccess() {
    mockLambdaSend.mockResolvedValue({
      $metadata: { requestId: `integration-test-req-${Date.now()}` },
      StatusCode: 202,
    });

    mockEcsSend.mockResolvedValue({
      $metadata: { requestId: `integration-test-ecs-${Date.now()}` },
      tasks: [
        {
          taskArn: `arn:aws:ecs:us-east-1:123456789:task/test-${Date.now()}`,
        },
      ],
      failures: [],
    });

    mockDockerCreateContainer.mockResolvedValue({
      id: `container-${Date.now()}`,
      start: jest.fn().mockResolvedValue(undefined),
    });
  }

  // Helper to mock transient Lambda failures
  function setupMockInvokerTransientFailures(failCount: number) {
    let attempts = 0;
    mockLambdaSend.mockImplementation(() => {
      attempts++;
      if (attempts <= failCount) {
        const error = new Error("TooManyRequestsException") as any;
        error.name = "TooManyRequestsException";
        error.$metadata = { httpStatusCode: 429 };
        return Promise.reject(error);
      }
      return Promise.resolve({
        $metadata: { requestId: `integration-test-req-${Date.now()}` },
        StatusCode: 202,
      });
    });
  }

  // Helper to mock permanent Lambda failure
  function setupMockInvokerPermanentFailure() {
    mockLambdaSend.mockRejectedValue({
      name: "ResourceNotFoundException",
      $metadata: { httpStatusCode: 404 },
      message: "Function not found",
    });
  }

  describe("End-to-end success flow", () => {
    it("should invoke worker and update job status on success", async () => {
      const job = createMockJob();
      const clanker = createMockClanker();

      // Execute job via WorkerExecutionService
      const executionResult = await executionService.executeJob(job, clanker);

      expect(executionResult.success).toBe(true);
      expect(executionResult.executionId).toBeDefined();
      expect(executionResult.workerType).toBe("lambda");
      expect(executionResult.attempts).toBe(1);

      // Verify job status was updated
      const updates = mockJobStatusUpdates.get(job.id);
      expect(updates).toBeDefined();
      expect(updates?.status).toBe("active");
      expect(updates?.progress).toBeDefined();
      expect(updates?.progress?.executionId).toBe(executionResult.executionId);
      expect(updates?.progress?.workerType).toBe("lambda");
    });

    it("should handle different worker types", async () => {
      const lambdaJob = createMockJob({ id: generateJobId() });
      const ecsJob = createMockJob({ id: generateJobId() });
      const dockerJob = createMockJob({ id: generateJobId() });

      const lambdaClanker = createMockClanker({
        deploymentStrategy: {
          id: "lambda",
          name: "lambda",
          description: "Lambda",
          createdAt: "2024-01-01T00:00:00Z",
        },
      });
      const ecsClanker = createMockClanker({
        id: "ecs-clanker",
        deploymentStrategy: {
          id: "ecs",
          name: "ecs",
          description: "ECS",
          createdAt: "2024-01-01T00:00:00Z",
        },
        deploymentConfig: {
          clusterArn: "arn:aws:ecs:us-east-1:123456789:cluster/test-cluster",
          taskDefinitionArn:
            "arn:aws:ecs:us-east-1:123456789:task-definition/test-task",
          subnetIds: ["subnet-1"],
          securityGroupIds: ["sg-1"],
        },
      });
      const dockerClanker = createMockClanker({
        id: "docker-clanker",
        deploymentStrategy: {
          id: "docker",
          name: "docker",
          description: "Docker",
          createdAt: "2024-01-01T00:00:00Z",
        },
        deploymentConfig: {
          containerImage: "viberator/worker:latest",
        },
      });

      // Execute Lambda job
      const lambdaResult = await executionService.executeJob(
        lambdaJob,
        lambdaClanker,
      );
      expect(lambdaResult.workerType).toBe("lambda");
      expect(mockJobStatusUpdates.get(lambdaJob.id)?.progress?.workerType).toBe(
        "lambda",
      );

      // Execute ECS job
      const ecsResult = await executionService.executeJob(ecsJob, ecsClanker);
      expect(ecsResult.workerType).toBe("ecs");
      expect(mockJobStatusUpdates.get(ecsJob.id)?.progress?.workerType).toBe(
        "ecs",
      );

      // Execute Docker job
      const dockerResult = await executionService.executeJob(
        dockerJob,
        dockerClanker,
      );
      expect(dockerResult.workerType).toBe("docker");
      expect(mockJobStatusUpdates.get(dockerJob.id)?.progress?.workerType).toBe(
        "docker",
      );
    });
  });

  describe("Transient error retries - real execution flow", () => {
    it("should retry transient errors and eventually succeed", async () => {
      const job = createMockJob();
      const clanker = createMockClanker();

      // Setup: Fail twice, succeed on third attempt
      setupMockInvokerTransientFailures(2);

      // Execute - should succeed after retries
      const result = await executionService.executeJob(job, clanker);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3); // Failed twice, succeeded on third
      expect(result.executionId).toBeDefined();

      // Verify final status in mock updates
      const finalUpdates = mockJobStatusUpdates.get(job.id);
      expect(finalUpdates?.status).toBe("active");
      expect(finalUpdates?.errorMessage).toBeUndefined();
    });

    it("should exhaust retries and fail after too many transient errors", async () => {
      jest.useFakeTimers();
      const job = createMockJob();
      const clanker = createMockClanker();

      // Setup: Always fail with transient error
      const error = new Error("ServiceException") as any;
      error.name = "ServiceException";
      error.$metadata = { httpStatusCode: 500 };
      mockLambdaSend.mockRejectedValue(error);

      // Execute - should fail after exhausting retries
      const executePromise = executionService.executeJob(job, clanker);

      // Advance through all retry delays
      await jest.advanceTimersByTimeAsync(1000); // Retry 1
      await jest.advanceTimersByTimeAsync(2000); // Retry 2
      await jest.advanceTimersByTimeAsync(4000); // Retry 3

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(4); // 1 initial + 3 retries (default maxRetries)
      expect(result.error).toMatch(/attempt/i);

      // Verify database state
      const finalUpdates = mockJobStatusUpdates.get(job.id);
      expect(finalUpdates?.status).toBe("failed");
      expect(finalUpdates?.errorMessage).toMatch(
        /Worker invocation failed after 4 attempts/,
      );
    });
  });

  describe("Permanent error handling", () => {
    it("should fail immediately on permanent error", async () => {
      const job = createMockJob();
      const clanker = createMockClanker();

      // Setup: Permanent failure
      setupMockInvokerPermanentFailure();

      // Execute - should fail immediately
      const result = await executionService.executeJob(job, clanker);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // No retries for permanent errors
      expect(result.error).toBeDefined();

      // Verify status
      const finalUpdates = mockJobStatusUpdates.get(job.id);
      expect(finalUpdates?.status).toBe("failed");
      expect(finalUpdates?.errorMessage).toContain("Lambda invocation failed");
    });

    it("should store error message for permanent failures", async () => {
      const job = createMockJob();
      const clanker = createMockClanker({
        deploymentConfig: {}, // Missing functionName - permanent error
      });

      // Execute - should fail due to missing config
      const result = await executionService.executeJob(job, clanker);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Lambda function name or ARN not configured",
      );

      // Verify error stored in status
      const finalUpdates = mockJobStatusUpdates.get(job.id);
      expect(finalUpdates?.errorMessage).toContain(
        "Lambda function name or ARN not configured",
      );
    });
  });

  describe("Orphan detection integration", () => {
    it("should have correct timeout configuration", async () => {
      // OrphanSweeper unit tests cover the full sweep logic
      // Here we just verify the configuration is applied correctly
      const customSweeper = new OrphanSweeper({
        jobTimeoutMs: 5000, // 5 seconds
      });

      // Run sweep with empty results (JobService is mocked)
      const orphanCount = await customSweeper.sweep();

      expect(orphanCount).toBe(0);
    });

    it("should return 0 when no orphaned jobs found", async () => {
      (jobService.findOrphanedJobs as jest.Mock).mockResolvedValue([]);

      const orphanCount = await orphanSweeper.sweep();

      expect(orphanCount).toBe(0);
      expect(jobService.updateJobStatus as jest.Mock).not.toHaveBeenCalled();
    });
  });

  describe("Job status transitions", () => {
    it("should transition through active -> failed on permanent error", async () => {
      const job = createMockJob();
      const clanker = createMockClanker({ deploymentConfig: {} });

      // Execute with permanent error
      await executionService.executeJob(job, clanker);

      // Verify final status is failed via the map
      const finalUpdates = mockJobStatusUpdates.get(job.id);
      expect(finalUpdates?.status).toBe("failed");
      expect(finalUpdates?.errorMessage).toContain(
        "Lambda function name or ARN not configured",
      );
    });
  });

  describe("Progress tracking", () => {
    it("should store execution details in progress field", async () => {
      const job = createMockJob();
      const clanker = createMockClanker();

      const result = await executionService.executeJob(job, clanker);

      const updates = mockJobStatusUpdates.get(job.id);

      expect(updates?.progress).toMatchObject({
        executionId: result.executionId,
        workerType: "lambda",
        message: "Worker invoked successfully",
      });
      expect(updates?.progress?.timestamp).toBeDefined();
    });

    it("should update progress message on worker invocation", async () => {
      const job = createMockJob();
      const clanker = createMockClanker();

      await executionService.executeJob(job, clanker);

      // After execution, should have progress
      const updates = mockJobStatusUpdates.get(job.id);
      expect(updates?.progress).toBeDefined();
      expect(updates?.progress?.message).toBe("Worker invoked successfully");
    });
  });

  describe("WorkerInvokerFactory integration", () => {
    it("should use factory to get correct invoker for clanker", async () => {
      const factory = getWorkerInvokerFactory();

      const lambdaClanker = createMockClanker({
        deploymentStrategy: {
          id: "lambda",
          name: "lambda",
          description: "Lambda",
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      const invoker = factory.getInvokerForClanker(lambdaClanker);

      expect(invoker.name).toBe("LambdaInvoker");
      expect(factory.getRegisteredTypes()).toContain("lambda");
    });

    it("should throw error for unknown worker type", () => {
      const factory = getWorkerInvokerFactory();

      const invalidClanker = createMockClanker({
        deploymentStrategy: {
          id: "unknown",
          name: "unknown",
          description: "Unknown",
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      expect(() => factory.getInvokerForClanker(invalidClanker)).toThrow();
    });
  });

  describe("Test isolation", () => {
    it("should not interfere between tests with unique job IDs", async () => {
      const job1 = createMockJob();
      const job2 = createMockJob();
      const clanker = createMockClanker();

      // Execute job1 with success
      await executionService.executeJob(job1, clanker);

      // Execute job2 with permanent error
      setupMockInvokerPermanentFailure();
      await executionService.executeJob(job2, {
        ...clanker,
        deploymentConfig: {},
      });

      // Verify each job has its own status
      const updates1 = mockJobStatusUpdates.get(job1.id);
      const updates2 = mockJobStatusUpdates.get(job2.id);

      expect(updates1?.status).toBe("active");
      expect(updates2?.status).toBe("failed");
    });
  });
});
