/**
 * Unit tests for HeartbeatSweeper
 *
 * Tests focus on:
 * - Stale job detection logic (heartbeat timeout calculation)
 * - Interval lifecycle (start/stop/isRunning)
 * - Empty stale job handling
 * - Jobs without any heartbeat are also detected
 *
 * Note: Logging verification is skipped (covered by integration).
 */

import { HeartbeatSweeper } from '../../../workers/HeartbeatSweeper';
import { JobService } from '../../../services/JobService';

jest.mock('../../../services/JobService');
const mockQueries = { findStaleJobs: jest.fn() };
jest.mock('../../../services/job/JobSweeperQueries', () => ({
  findStaleJobs: (...args: unknown[]) => mockQueries.findStaleJobs(...args),
}));

describe('HeartbeatSweeper', () => {
  let sweeper: HeartbeatSweeper;
  let mockJobService: jest.Mocked<JobService>;

  const workers = { stop: jest.fn().mockResolvedValue(true) };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockJobService = {
      updateJobStatus: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<JobService>;
    (JobService as jest.Mock).mockImplementation(() => mockJobService);
    mockQueries.findStaleJobs.mockResolvedValue([]);

    sweeper = new HeartbeatSweeper({}, workers);
  });

  afterEach(() => {
    if (sweeper.isRunning()) {
      sweeper.stop();
    }
    jest.useRealTimers();
  });

  describe('Stale Job Detection', () => {
    it('should find and mark stale jobs past heartbeat threshold', async () => {
      const staleJobs = [
        { id: 'job-1', started_at: new Date(), last_heartbeat: new Date(Date.now() - 10 * 60_000) },
        { id: 'job-2', started_at: new Date(), last_heartbeat: new Date(Date.now() - 8 * 60_000) },
      ];

      mockQueries.findStaleJobs.mockResolvedValue(staleJobs);

      const count = await sweeper.sweep();

      expect(mockQueries.findStaleJobs).toHaveBeenCalledTimes(1);
      const cutoffArg = mockQueries.findStaleJobs.mock.calls[0][0] as Date;
      const cutoffAge = Date.now() - cutoffArg.getTime();
      expect(cutoffAge).toBeGreaterThan(4 * 60_000); // ~5 minutes
      expect(cutoffAge).toBeLessThan(6 * 60_000);

      expect(mockJobService.updateJobStatus).toHaveBeenCalledTimes(2);
      expect(workers.stop).toHaveBeenCalledWith('job-1', 'no heartbeat');
      expect(workers.stop).toHaveBeenCalledWith('job-2', 'no heartbeat');
      expect(mockJobService.updateJobStatus).toHaveBeenCalledWith('job-1', 'failed', {
        errorMessage: 'Job failed: No heartbeat received within grace period',
        failureCode: 'RUN_LOST',
        expectedStatus: 'active',
        expectedHeartbeatBefore: expect.any(Date),
      });
      expect(mockJobService.updateJobStatus).toHaveBeenCalledWith('job-2', 'failed', {
        errorMessage: 'Job failed: No heartbeat received within grace period',
        failureCode: 'RUN_LOST',
        expectedStatus: 'active',
        expectedHeartbeatBefore: expect.any(Date),
      });

      expect(count).toBe(2);
    });

    it('should return 0 when no stale jobs found', async () => {
      mockQueries.findStaleJobs.mockResolvedValue([]);

      const count = await sweeper.sweep();

      expect(count).toBe(0);
      expect(mockJobService.updateJobStatus).not.toHaveBeenCalled();
    });

    it('should calculate default grace period as 5 minutes', async () => {
      const now = Date.now();
      let capturedCutoff: Date | undefined;

      mockQueries.findStaleJobs.mockImplementation((cutoff) => {
        capturedCutoff = cutoff as Date;
        return Promise.resolve([]);
      });

      await sweeper.sweep();

      expect(capturedCutoff).toBeDefined();
      const age = now - capturedCutoff!.getTime();
      expect(age).toBeGreaterThanOrEqual(299000);
      expect(age).toBeLessThanOrEqual(301000);
    });
  });

  describe('Grace Period Configuration', () => {
    it('should respect custom gracePeriodMs', async () => {
      const now = Date.now();
      let capturedCutoff: Date | undefined;

      mockQueries.findStaleJobs.mockReset();
      mockJobService.updateJobStatus.mockReset();

      mockQueries.findStaleJobs.mockImplementation((cutoff) => {
        capturedCutoff = cutoff as Date;
        return Promise.resolve([]);
      });
      mockJobService.updateJobStatus.mockResolvedValue(true);

      const customSweeper = new HeartbeatSweeper({
        gracePeriodMs: 2 * 60_000, // 2 minutes
      }, workers);

      await customSweeper.sweep();

      expect(capturedCutoff).toBeDefined();
      const age = now - capturedCutoff!.getTime();
      expect(age).toBeGreaterThanOrEqual(119000); // ~2 minutes (120000ms)
      expect(age).toBeLessThanOrEqual(121000);
    });

    it('should handle very short grace period values', async () => {
      const customSweeper = new HeartbeatSweeper({
        gracePeriodMs: 100, // 100ms for testing
      }, workers);

      const now = Date.now();
      let capturedCutoff: Date | undefined;

      mockQueries.findStaleJobs.mockImplementation((cutoff) => {
        capturedCutoff = cutoff as Date;
        return Promise.resolve([]);
      });

      await customSweeper.sweep();

      expect(capturedCutoff).toBeDefined();
      const age = now - capturedCutoff!.getTime();
      expect(age).toBeGreaterThanOrEqual(90);
      expect(age).toBeLessThanOrEqual(110);
    });
  });

  describe('Interval Lifecycle', () => {
    it('should return isRunning false when not started', () => {
      expect(sweeper.isRunning()).toBe(false);
    });

    it('should return isRunning true after start', () => {
      sweeper.start();
      expect(sweeper.isRunning()).toBe(true);
      sweeper.stop();
    });

    it('should return isRunning false after stop', () => {
      sweeper.start();
      sweeper.stop();
      expect(sweeper.isRunning()).toBe(false);
    });

    it('should allow restart after stop', () => {
      sweeper.start();
      expect(sweeper.isRunning()).toBe(true);

      sweeper.stop();
      expect(sweeper.isRunning()).toBe(false);

      sweeper.start();
      expect(sweeper.isRunning()).toBe(true);

      sweeper.stop();
    });

    it('should run initial sweep on start', async () => {
      sweeper.start();

      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);

      expect(mockQueries.findStaleJobs).toHaveBeenCalledTimes(1);
    });

    it('should stop periodic sweeps when stop() is called', async () => {
      sweeper.start();

      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);
      expect(mockQueries.findStaleJobs).toHaveBeenCalledTimes(1);

      mockQueries.findStaleJobs.mockClear();

      sweeper.stop();
      expect(sweeper.isRunning()).toBe(false);

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockQueries.findStaleJobs).not.toHaveBeenCalled();
    });
  });

  describe('Sweep Interval Configuration', () => {
    it('should respect custom sweepIntervalMs', async () => {
      const customSweeper = new HeartbeatSweeper({
        sweepIntervalMs: 2000, // 2 seconds
      }, workers);

      customSweeper.start();

      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);
      expect(mockQueries.findStaleJobs).toHaveBeenCalledTimes(1);

      mockQueries.findStaleJobs.mockClear();

      await jest.advanceTimersByTimeAsync(1000);
      expect(mockQueries.findStaleJobs).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1000);
      expect(mockQueries.findStaleJobs).toHaveBeenCalledTimes(1);

      customSweeper.stop();
    });

    it('should run periodic sweeps at default 60 second interval', async () => {
      sweeper.start();

      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);
      expect(mockQueries.findStaleJobs).toHaveBeenCalledTimes(1);

      mockQueries.findStaleJobs.mockClear();

      await jest.advanceTimersByTimeAsync(60000);
      expect(mockQueries.findStaleJobs).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle findStaleJobs errors gracefully', async () => {
      mockQueries.findStaleJobs.mockReset().mockRejectedValue(new Error('Database error'));

      await expect(sweeper.sweep()).rejects.toThrow('Database error');
    });

    it('should stop processing when updateJobStatus fails', async () => {
      const staleJobs = [
        { id: 'job-1', started_at: new Date(), last_heartbeat: new Date(Date.now() - 10 * 60_000) },
        { id: 'job-2', started_at: new Date(), last_heartbeat: new Date(Date.now() - 8 * 60_000) },
        { id: 'job-3', started_at: new Date(), last_heartbeat: new Date(Date.now() - 6 * 60_000) },
      ];

      mockQueries.findStaleJobs.mockReset().mockResolvedValue(staleJobs);

      mockJobService.updateJobStatus
        .mockRejectedValueOnce(new Error('Update failed'))
        .mockResolvedValue(true)
        .mockResolvedValue(true);

      await expect(sweeper.sweep()).rejects.toThrow('Update failed');

      expect(mockJobService.updateJobStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multiple Stale Jobs', () => {
    it('should process multiple stale jobs in a single sweep', async () => {
      const staleJobs = Array.from({ length: 10 }, (_, i) => ({
        id: `job-${i}`,
        started_at: new Date(),
        last_heartbeat: new Date(Date.now() - 10 * 60_000),
      }));

      mockQueries.findStaleJobs.mockResolvedValue(staleJobs);

      const count = await sweeper.sweep();

      expect(count).toBe(10);
      expect(mockJobService.updateJobStatus).toHaveBeenCalledTimes(10);
    });

    it('should handle empty result from findStaleJobs', async () => {
      mockQueries.findStaleJobs.mockResolvedValue([]);

      const count = await sweeper.sweep();

      expect(count).toBe(0);
      expect(mockJobService.updateJobStatus).not.toHaveBeenCalled();
    });
  });

  describe('Initial Sweep Behavior', () => {
    it('should run sweep immediately on start without waiting for interval', async () => {
      sweeper.start();

      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);

      expect(mockQueries.findStaleJobs).toHaveBeenCalledTimes(1);
    });
  });

  describe('Race Condition Fix - Result Callback', () => {
    it('should not mark job as failed if result callback updates heartbeat', async () => {
      
      const jobsWithRecentHeartbeat = [
        { 
          id: 'job-just-finished', 
          started_at: new Date(Date.now() - 30 * 60_000), // 30 min ago
          last_heartbeat: new Date(Date.now() - 1_000) // 1 second ago (updated by result callback)
        },
      ];

      mockQueries.findStaleJobs.mockResolvedValue(jobsWithRecentHeartbeat);

      const count = await sweeper.sweep();

      expect(count).toBe(1); // Found 1 stale job (mock returns it)
      expect(mockJobService.updateJobStatus).toHaveBeenCalledWith('job-just-finished', 'failed', {
        errorMessage: 'Job failed: No heartbeat received within grace period',
        failureCode: 'RUN_LOST',
        expectedStatus: 'active',
        expectedHeartbeatBefore: expect.any(Date),
      });

    });
  });
});
