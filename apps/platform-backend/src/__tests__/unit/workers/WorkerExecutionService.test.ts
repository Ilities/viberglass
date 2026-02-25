/**
 * Unit tests for WorkerExecutionService
 *
 * Tests focus on retry logic - the complex part worth testing:
 * - Transient errors trigger retry with exponential backoff
 * - Permanent errors fail immediately (no retry)
 * - Max retries is respected
 * - Backoff calculation caps at maxDelayMs
 *
 * Note: Simple status updates are covered by integration tests.
 */

import { WorkerExecutionService } from "../../../workers/WorkerExecutionService";
import {
  WorkerError,
  ErrorClassification,
} from "../../../workers/errors/WorkerError";
import { JobService } from "../../../services/JobService";
import {
  getWorkerInvokerFactory,
  resetWorkerInvokerFactory,
} from "../../../workers/WorkerInvokerFactory";
import type { Clanker } from "@viberglass/types";
import type { JobData } from "../../../types/Job";
import type { WorkerInvoker } from "../../../workers/WorkerInvoker";

// Mock JobService
jest.mock("../../../services/JobService");

// Mock WorkerInvokerFactory
jest.mock("../../../workers/WorkerInvokerFactory", () => ({
  getWorkerInvokerFactory: jest.fn(),
  resetWorkerInvokerFactory: jest.fn(),
}));

describe("WorkerExecutionService", () => {
  let service: WorkerExecutionService;
  let mockJobService: jest.Mocked<JobService>;
  let mockInvoker: jest.Mocked<WorkerInvoker>;
  let mockFactory: { getInvokerForClanker: jest.Mock };
  let mockJob: JobData;
  let mockClanker: Clanker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock job data
    mockJob = {
      id: "job-123",
      tenantId: "tenant-456",
      repository: "https://github.com/test/repo",
      task: "Fix the bug",
      timestamp: Date.now(),
    };

    // Mock clanker with lambda deployment strategy
    mockClanker = {
      id: "clanker-789",
      name: "Test Clanker",
      slug: "test-clanker",
      status: "active",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      deploymentStrategy: {
        id: "strategy-1",
        name: "lambda",
        description: "Lambda deployment",
        createdAt: "2024-01-01T00:00:00Z",
      },
      configFiles: [],
      secretIds: [],
    };

    // Mock JobService
    mockJobService = {
      updateJobStatus: jest.fn().mockResolvedValue(undefined),
      findOrphanedJobs: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<JobService>;
    (JobService as jest.Mock).mockImplementation(() => mockJobService);

    // Mock WorkerInvoker
    mockInvoker = {
      name: "lambda",
      invoke: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // Mock WorkerInvokerFactory
    mockFactory = {
      getInvokerForClanker: jest.fn().mockReturnValue(mockInvoker),
    };
    (getWorkerInvokerFactory as jest.Mock).mockReturnValue(mockFactory);

    service = new WorkerExecutionService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Retry Logic - Transient Errors", () => {
    it("should retry once with exponential backoff on transient error", async () => {
      // First call fails with transient error, second succeeds
      mockInvoker.invoke
        .mockRejectedValueOnce(
          new WorkerError("Rate limit exceeded", ErrorClassification.TRANSIENT),
        )
        .mockResolvedValueOnce({
          executionId: "exec-123",
          workerType: "lambda",
        });

      const executePromise = service.executeJob(mockJob, mockClanker);

      // The first attempt happens synchronously, then schedules a retry
      // Wait for the promise microtasks to flush
      await Promise.resolve();

      // Initial attempt should have happened
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(1);

      // Advance past first retry delay (baseDelayMs = 1000ms)
      await jest.advanceTimersByTimeAsync(1000);
      await executePromise;

      // Should have been called twice (initial + 1 retry)
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(2);
      // updateJobStatus called twice: initial 'active' + success update with executionId
      expect(mockJobService.updateJobStatus).toHaveBeenCalledTimes(2);
    });

    it("should succeed after multiple transient retries with exponential backoff", async () => {
      // Fail twice, succeed on third attempt
      mockInvoker.invoke
        .mockRejectedValueOnce(
          new WorkerError("Network error", ErrorClassification.TRANSIENT),
        )
        .mockRejectedValueOnce(
          new WorkerError("Timeout", ErrorClassification.TRANSIENT),
        )
        .mockResolvedValueOnce({
          executionId: "exec-456",
          workerType: "lambda",
        });

      const executePromise = service.executeJob(mockJob, mockClanker);

      // First retry at 1s (baseDelayMs)
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(2);

      // Second retry at 2s (baseDelayMs * 2^1)
      await jest.advanceTimersByTimeAsync(2000);
      await executePromise;

      expect(mockInvoker.invoke).toHaveBeenCalledTimes(3);
    });

    it("should exhaust retries and fail after maxRetries transient errors", async () => {
      const transientError = new WorkerError(
        "Service unavailable",
        ErrorClassification.TRANSIENT,
      );

      // Always fail with transient error
      mockInvoker.invoke.mockRejectedValue(transientError);

      const executePromise = service.executeJob(mockJob, mockClanker);

      // Advance through all retry delays: 1s, 2s, 4s (maxRetries=3, so 3 attempts after initial)
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(4000);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(4); // 1 initial + 3 retries
      expect(result.error).toMatch(/attempt/i);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(4);
    });

    it("should mark job as failed when max retries exhausted", async () => {
      const transientError = new WorkerError(
        "Always failing",
        ErrorClassification.TRANSIENT,
      );
      mockInvoker.invoke.mockRejectedValue(transientError);

      const executePromise = service.executeJob(mockJob, mockClanker);

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(4000);

      await executePromise;

      // Should have called updateJobStatus with 'failed' at the end
      const failedCalls = mockJobService.updateJobStatus.mock.calls.filter(
        (call) => call[1] === "failed",
      );
      expect(failedCalls.length).toBeGreaterThan(0);
    });

    it("should allow extra retries for Lambda Pending ResourceConflictException", async () => {
      const customService = new WorkerExecutionService({
        maxRetries: 1, // base attempts: 2
        maxPendingConflictRetries: 2, // +2 extra attempts for Pending conflicts
      });

      const pendingCause = new Error(
        "The function is currently in the following state: Pending",
      );
      const pendingConflict = new WorkerError(
        "Lambda invocation failed (transient): ResourceConflictException",
        ErrorClassification.TRANSIENT,
        pendingCause,
        1000,
      );

      mockInvoker.invoke
        .mockRejectedValueOnce(pendingConflict)
        .mockRejectedValueOnce(pendingConflict)
        .mockRejectedValueOnce(pendingConflict)
        .mockResolvedValueOnce({
          executionId: "exec-after-pending",
          workerType: "lambda",
        });

      (getWorkerInvokerFactory as jest.Mock).mockReturnValue(mockFactory);

      const executePromise = customService.executeJob(mockJob, mockClanker);

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(4000);
      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(4); // 2 base + 2 extra pending retries
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(4);
    });
  });

  describe("Retry Logic - Permanent Errors", () => {
    it("should fail immediately on permanent error without retry", async () => {
      const permanentError = new WorkerError(
        "Invalid credentials",
        ErrorClassification.PERMANENT,
      );

      mockInvoker.invoke.mockRejectedValue(permanentError);

      const executePromise = service.executeJob(mockJob, mockClanker);

      // No timers should be needed - should fail immediately
      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // Single attempt only
      expect(result.error).toContain("Invalid credentials");

      // Should only have been called once (no retries)
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(1);
    });

    it("should not advance timers for permanent error", async () => {
      const permanentError = new WorkerError(
        "Configuration error",
        ErrorClassification.PERMANENT,
      );

      mockInvoker.invoke.mockRejectedValue(permanentError);

      // Spy on setTimeout to verify no backoff delay
      const setTimeoutSpy = jest.spyOn(global, "setTimeout");

      const executePromise = service.executeJob(mockJob, mockClanker);
      await executePromise;

      // setTimeout should not have been called for backoff
      // (it might be called for other purposes, but not for retry delay)
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(1);

      setTimeoutSpy.mockRestore();
    });

    it("should mark job as failed on permanent error", async () => {
      const permanentError = new WorkerError(
        "Access denied",
        ErrorClassification.PERMANENT,
      );

      mockInvoker.invoke.mockRejectedValue(permanentError);

      await service.executeJob(mockJob, mockClanker);

      const failedCalls = mockJobService.updateJobStatus.mock.calls.filter(
        (call) => call[1] === "failed",
      );
      expect(failedCalls.length).toBe(1);
      const failedCall = failedCalls[0];
      if (failedCall?.[2]?.errorMessage) {
        expect(failedCall[2].errorMessage).toContain("Access denied");
      }
    });
  });

  describe("Backoff Calculation", () => {
    it("should use baseDelayMs (1000ms) for first retry", async () => {
      mockInvoker.invoke
        .mockRejectedValueOnce(
          new WorkerError("Error 1", ErrorClassification.TRANSIENT),
        )
        .mockResolvedValueOnce({
          executionId: "exec-1",
          workerType: "lambda",
        });

      const executePromise = service.executeJob(mockJob, mockClanker);

      // Advance 900ms - not enough for retry
      await jest.advanceTimersByTimeAsync(900);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(1);

      // Advance another 100ms - triggers retry
      await jest.advanceTimersByTimeAsync(100);
      await executePromise;

      expect(mockInvoker.invoke).toHaveBeenCalledTimes(2);
    });

    it("should honor retryAfterMs when greater than calculated backoff", async () => {
      mockInvoker.invoke
        .mockRejectedValueOnce(
          new WorkerError(
            "Lambda still pending",
            ErrorClassification.TRANSIENT,
            undefined,
            5000,
          ),
        )
        .mockResolvedValueOnce({
          executionId: "exec-1",
          workerType: "lambda",
        });

      const executePromise = service.executeJob(mockJob, mockClanker);

      // Backoff would normally be 1000ms, but retryAfterMs forces 5000ms
      await jest.advanceTimersByTimeAsync(4000);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1000);
      await executePromise;

      expect(mockInvoker.invoke).toHaveBeenCalledTimes(2);
    });

    it("should double delay each retry (exponential backoff)", async () => {
      mockInvoker.invoke
        .mockRejectedValueOnce(
          new WorkerError("Error 1", ErrorClassification.TRANSIENT),
        )
        .mockRejectedValueOnce(
          new WorkerError("Error 2", ErrorClassification.TRANSIENT),
        )
        .mockRejectedValueOnce(
          new WorkerError("Error 3", ErrorClassification.TRANSIENT),
        )
        .mockResolvedValueOnce({
          executionId: "exec-1",
          workerType: "lambda",
        });

      const executePromise = service.executeJob(mockJob, mockClanker);

      // Wait for initial call
      await Promise.resolve();

      // Initial attempt
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(1);

      // First retry after 1s
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(2);

      // Second retry after 2s (1s * 2)
      await jest.advanceTimersByTimeAsync(2000);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(3);

      // Third retry after 4s (1s * 2^2)
      await jest.advanceTimersByTimeAsync(4000);
      await executePromise;

      expect(mockInvoker.invoke).toHaveBeenCalledTimes(4);
    });

    it("should cap backoff delay at maxDelayMs", async () => {
      // Create service with small maxDelayMs for testing
      const customService = new WorkerExecutionService({
        maxRetries: 10,
        baseDelayMs: 1000,
        maxDelayMs: 3000, // Cap at 3s
      });

      // Make it fail many times to test backoff cap
      mockInvoker.invoke
        .mockRejectedValueOnce(
          new WorkerError("Error 1", ErrorClassification.TRANSIENT),
        )
        .mockRejectedValueOnce(
          new WorkerError("Error 2", ErrorClassification.TRANSIENT),
        )
        .mockRejectedValueOnce(
          new WorkerError("Error 3", ErrorClassification.TRANSIENT),
        )
        .mockRejectedValueOnce(
          new WorkerError("Error 4", ErrorClassification.TRANSIENT),
        )
        .mockResolvedValueOnce({
          executionId: "exec-1",
          workerType: "lambda",
        });

      // Recreate factory for custom service
      (getWorkerInvokerFactory as jest.Mock).mockReturnValue(mockFactory);

      const executePromise = customService.executeJob(mockJob, mockClanker);

      // Sequence of delays: 1s, 2s, 3s (capped), 3s (capped)
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(2000);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(3);

      // This would be 4s with pure exponential, but capped at 3s
      await jest.advanceTimersByTimeAsync(3000);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(4);

      // This would be 8s, but capped at 3s
      await jest.advanceTimersByTimeAsync(3000);
      await executePromise;

      expect(mockInvoker.invoke).toHaveBeenCalledTimes(5);
    });

    it("should allow custom baseDelayMs and maxDelayMs", async () => {
      const customService = new WorkerExecutionService({
        maxRetries: 2,
        baseDelayMs: 500, // 500ms base
        maxDelayMs: 1500, // 1.5s max
      });

      mockInvoker.invoke
        .mockRejectedValueOnce(
          new WorkerError("Error 1", ErrorClassification.TRANSIENT),
        )
        .mockRejectedValueOnce(
          new WorkerError("Error 2", ErrorClassification.TRANSIENT),
        )
        .mockResolvedValueOnce({
          executionId: "exec-1",
          workerType: "lambda",
        });

      (getWorkerInvokerFactory as jest.Mock).mockReturnValue(mockFactory);

      const executePromise = customService.executeJob(mockJob, mockClanker);

      // Delays: 500ms, 1000ms (both under cap)
      await jest.advanceTimersByTimeAsync(500);
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(1000);
      await executePromise;

      expect(mockInvoker.invoke).toHaveBeenCalledTimes(3);
    });
  });

  describe("Max Retries Configuration", () => {
    it("should use default maxRetries of 3", async () => {
      mockInvoker.invoke.mockRejectedValue(
        new WorkerError("Always failing", ErrorClassification.TRANSIENT),
      );

      const executePromise = service.executeJob(mockJob, mockClanker);

      // Default maxRetries=3 means 4 total attempts (1 initial + 3 retries)
      await jest.advanceTimersByTimeAsync(1000); // Retry 1
      await jest.advanceTimersByTimeAsync(2000); // Retry 2
      await jest.advanceTimersByTimeAsync(4000); // Retry 3
      await executePromise;

      expect(mockInvoker.invoke).toHaveBeenCalledTimes(4);
    });

    it("should respect custom maxRetries configuration", async () => {
      const customService = new WorkerExecutionService({
        maxRetries: 1, // Only 1 retry
      });

      mockInvoker.invoke.mockRejectedValue(
        new WorkerError("Always failing", ErrorClassification.TRANSIENT),
      );

      (getWorkerInvokerFactory as jest.Mock).mockReturnValue(mockFactory);

      const executePromise = customService.executeJob(mockJob, mockClanker);

      // Should only retry once
      await jest.advanceTimersByTimeAsync(1000);
      await executePromise;

      expect(mockInvoker.invoke).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it("should allow maxRetries of 0 (no retries)", async () => {
      const customService = new WorkerExecutionService({
        maxRetries: 0,
      });

      mockInvoker.invoke.mockRejectedValue(
        new WorkerError("Always failing", ErrorClassification.TRANSIENT),
      );

      (getWorkerInvokerFactory as jest.Mock).mockReturnValue(mockFactory);

      const executePromise = customService.executeJob(mockJob, mockClanker);
      await executePromise;

      // Should only attempt once, no retries
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe("Unknown Error Types", () => {
    it("should treat non-WorkerError as permanent and fail immediately", async () => {
      const genericError = new Error("Some unknown error");
      mockInvoker.invoke.mockRejectedValue(genericError);

      const executePromise = service.executeJob(mockJob, mockClanker);
      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // No retries for unknown errors
      expect(mockInvoker.invoke).toHaveBeenCalledTimes(1);
    });

    it("should mark job as failed on unknown error type", async () => {
      const genericError = new TypeError("Type error occurred");
      mockInvoker.invoke.mockRejectedValue(genericError);

      await service.executeJob(mockJob, mockClanker);

      const failedCalls = mockJobService.updateJobStatus.mock.calls.filter(
        (call) => call[1] === "failed",
      );
      expect(failedCalls.length).toBe(1);
    });
  });

  describe("Successful Execution", () => {
    it("should return execution result on success", async () => {
      mockInvoker.invoke.mockResolvedValue({
        executionId: "exec-success-123",
        workerType: "lambda",
      });

      const result = await service.executeJob(mockJob, mockClanker);

      expect(result.success).toBe(true);
      expect(result.executionId).toBe("exec-success-123");
      expect(result.workerType).toBe("lambda");
      expect(result.attempts).toBe(1);
    });

    it("should store executionId in job progress on success", async () => {
      mockInvoker.invoke.mockResolvedValue({
        executionId: "exec-xyz-789",
        workerType: "lambda",
      });

      await service.executeJob(mockJob, mockClanker);

      // Find the updateJobStatus call that includes executionId
      const successCalls = mockJobService.updateJobStatus.mock.calls.filter(
        (call) => call[1] === "active" && call[2]?.progress?.executionId,
      );

      expect(successCalls.length).toBe(1);
      const successCall = successCalls[0];
      if (successCall?.[2]?.progress) {
        expect(successCall[2].progress.executionId).toBe("exec-xyz-789");
        expect(successCall[2].progress.workerType).toBe("lambda");
      }
    });
  });

  describe("Execution Status Flow", () => {
    it("should mark job as active before invocation", async () => {
      mockInvoker.invoke.mockResolvedValue({
        executionId: "exec-1",
        workerType: "lambda",
      });

      await service.executeJob(mockJob, mockClanker);

      // First call should be to mark as active
      expect(mockJobService.updateJobStatus).toHaveBeenNthCalledWith(
        1,
        mockJob.id,
        "active",
        {
          progress: {
            message: "Invoking worker",
            timestamp: expect.any(Number),
          },
        },
      );
    });

    it("should update job progress with executionId after successful invocation", async () => {
      mockInvoker.invoke.mockResolvedValue({
        executionId: "exec-abc",
        workerType: "lambda",
      });

      await service.executeJob(mockJob, mockClanker);

      // Second call should include execution details
      expect(mockJobService.updateJobStatus).toHaveBeenNthCalledWith(
        2,
        mockJob.id,
        "active",
        {
          progress: {
            message: "Worker invoked successfully",
            executionId: "exec-abc",
            workerType: "lambda",
            timestamp: expect.any(Number),
          },
        },
      );
    });
  });
});
