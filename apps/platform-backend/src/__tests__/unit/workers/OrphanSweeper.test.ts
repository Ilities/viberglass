/**
 * Unit tests for OrphanSweeper
 *
 * Tests focus on:
 * - Orphan detection logic (timeout calculation)
 * - Interval lifecycle (start/stop/isRunning)
 * - Empty orphan handling
 *
 * Note: Logging verification is skipped (covered by integration).
 */

import { OrphanSweeper } from '../../../workers/OrphanSweeper';
import { JobService } from '../../../services/JobService';

// Mock JobService
jest.mock('../../../services/JobService');

describe('OrphanSweeper', () => {
  let sweeper: OrphanSweeper;
  let mockJobService: jest.Mocked<JobService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock JobService
    mockJobService = {
      findOrphanedJobs: jest.fn().mockResolvedValue([]),
      updateJobStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<JobService>;
    (JobService as jest.Mock).mockImplementation(() => mockJobService);

    sweeper = new OrphanSweeper();
  });

  afterEach(() => {
    if (sweeper.isRunning()) {
      sweeper.stop();
    }
    jest.useRealTimers();
  });

  describe('Orphan Detection', () => {
    it('should find and mark orphaned jobs past timeout threshold', async () => {
      // Create mock orphaned jobs
      const orphanedJobs = [
        { id: 'job-1', started_at: new Date(Date.now() - 40 * 60_000) }, // 40 minutes ago
        { id: 'job-2', started_at: new Date(Date.now() - 35 * 60_000) }, // 35 minutes ago
      ];

      mockJobService.findOrphanedJobs.mockResolvedValue(orphanedJobs);

      const count = await sweeper.sweep();

      // Verify cutoff time was calculated correctly (default 30 minutes)
      expect(mockJobService.findOrphanedJobs).toHaveBeenCalledTimes(1);
      const cutoffArg = mockJobService.findOrphanedJobs.mock.calls[0][0] as Date;
      const cutoffAge = Date.now() - cutoffArg.getTime();
      expect(cutoffAge).toBeGreaterThan(29 * 60_000); // ~30 minutes
      expect(cutoffAge).toBeLessThan(31 * 60_000);

      // Verify each orphan was marked as failed
      expect(mockJobService.updateJobStatus).toHaveBeenCalledTimes(2);
      expect(mockJobService.updateJobStatus).toHaveBeenCalledWith('job-1', 'failed', {
        errorMessage: 'Job timed out after 1800s without callback',
      });
      expect(mockJobService.updateJobStatus).toHaveBeenCalledWith('job-2', 'failed', {
        errorMessage: 'Job timed out after 1800s without callback',
      });

      expect(count).toBe(2);
    });

    it('should return 0 when no orphaned jobs found', async () => {
      mockJobService.findOrphanedJobs.mockResolvedValue([]);

      const count = await sweeper.sweep();

      expect(count).toBe(0);
      expect(mockJobService.updateJobStatus).not.toHaveBeenCalled();
    });

    it('should calculate default timeout as 30 minutes', async () => {
      const now = Date.now();
      let capturedCutoff: Date | undefined;

      mockJobService.findOrphanedJobs.mockImplementation((cutoff) => {
        capturedCutoff = cutoff as Date;
        return Promise.resolve([]);
      });

      await sweeper.sweep();

      expect(capturedCutoff).toBeDefined();
      const age = now - capturedCutoff!.getTime();
      // Should be approximately 30 minutes (1800000ms)
      expect(age).toBeGreaterThanOrEqual(1799000);
      expect(age).toBeLessThanOrEqual(1801000);
    });
  });

  describe('Timeout Configuration', () => {
    it('should respect custom jobTimeoutMs', async () => {
      const now = Date.now();
      let capturedCutoff: Date | undefined;

      // Clear previous mocks and set fresh implementation
      mockJobService.findOrphanedJobs.mockReset();
      mockJobService.updateJobStatus.mockReset();

      mockJobService.findOrphanedJobs.mockImplementation((cutoff) => {
        capturedCutoff = cutoff as Date;
        return Promise.resolve([]);
      });
      mockJobService.updateJobStatus.mockResolvedValue(undefined);

      const customSweeper = new OrphanSweeper({
        jobTimeoutMs: 10 * 60_000, // 10 minutes
      });

      await customSweeper.sweep();

      expect(capturedCutoff).toBeDefined();
      const age = now - capturedCutoff!.getTime();
      expect(age).toBeGreaterThanOrEqual(599000); // ~10 minutes (600000ms)
      expect(age).toBeLessThanOrEqual(601000);
    });

    it('should use custom timeout in error message', async () => {
      const customSweeper = new OrphanSweeper({
        jobTimeoutMs: 5 * 60_000, // 5 minutes
      });

      const orphanedJobs = [{ id: 'job-timeout', started_at: new Date() }];
      mockJobService.findOrphanedJobs.mockResolvedValue(orphanedJobs);

      await customSweeper.sweep();

      expect(mockJobService.updateJobStatus).toHaveBeenCalledWith('job-timeout', 'failed', {
        errorMessage: 'Job timed out after 300s without callback',
      });
    });

    it('should handle very short timeout values', async () => {
      const customSweeper = new OrphanSweeper({
        jobTimeoutMs: 100, // 100ms for testing
      });

      const now = Date.now();
      let capturedCutoff: Date | undefined;

      mockJobService.findOrphanedJobs.mockImplementation((cutoff) => {
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

      // Restart
      sweeper.start();
      expect(sweeper.isRunning()).toBe(true);

      sweeper.stop();
    });

    it('should warn when start() called while already running', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      sweeper.start();
      sweeper.start(); // Call start again while running

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[OrphanSweeper] Already running'
      );

      consoleWarnSpy.mockRestore();
      sweeper.stop();
    });

    it('should run initial sweep on start', async () => {
      sweeper.start();

      // Wait for microtasks and advance timers slightly for the initial sweep
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);

      expect(mockJobService.findOrphanedJobs).toHaveBeenCalledTimes(1);
    });

    it('should stop periodic sweeps when stop() is called', async () => {
      sweeper.start();

      // Initial sweep
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);
      expect(mockJobService.findOrphanedJobs).toHaveBeenCalledTimes(1);

      mockJobService.findOrphanedJobs.mockClear();

      // Stop the sweeper
      sweeper.stop();
      expect(sweeper.isRunning()).toBe(false);

      // Advance past interval - no new sweep should occur
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockJobService.findOrphanedJobs).not.toHaveBeenCalled();
    });
  });

  describe('Sweep Interval Configuration', () => {
    it('should respect custom sweepIntervalMs', async () => {
      const customSweeper = new OrphanSweeper({
        sweepIntervalMs: 2000, // 2 seconds
      });

      customSweeper.start();

      // Initial sweep
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);
      expect(mockJobService.findOrphanedJobs).toHaveBeenCalledTimes(1);

      mockJobService.findOrphanedJobs.mockClear();

      // Advance 1 second - not yet time for next sweep
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockJobService.findOrphanedJobs).not.toHaveBeenCalled();

      // Advance another second - triggers next sweep
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockJobService.findOrphanedJobs).toHaveBeenCalledTimes(1);

      customSweeper.stop();
    });

    it('should run periodic sweeps at default 60 second interval', async () => {
      sweeper.start();

      // Initial sweep
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);
      expect(mockJobService.findOrphanedJobs).toHaveBeenCalledTimes(1);

      mockJobService.findOrphanedJobs.mockClear();

      // Advance to next sweep (60 seconds)
      await jest.advanceTimersByTimeAsync(60000);
      expect(mockJobService.findOrphanedJobs).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle findOrphanedJobs errors gracefully', async () => {
      mockJobService.findOrphanedJobs.mockReset().mockRejectedValue(new Error('Database error'));

      // The sweep() method will reject on findOrphanedJobs error
      await expect(sweeper.sweep()).rejects.toThrow('Database error');
    });

    it('should stop processing when updateJobStatus fails', async () => {
      const orphanedJobs = [
        { id: 'job-1', started_at: new Date() },
        { id: 'job-2', started_at: new Date() },
        { id: 'job-3', started_at: new Date() },
      ];

      mockJobService.findOrphanedJobs.mockReset().mockResolvedValue(orphanedJobs);

      // First updateJobStatus fails - sweep should stop there
      mockJobService.updateJobStatus
        .mockRejectedValueOnce(new Error('Update failed'))
        .mockResolvedValue(undefined)
        .mockResolvedValue(undefined);

      // The sweep will fail due to the first updateJobStatus error
      await expect(sweeper.sweep()).rejects.toThrow('Update failed');

      // Only the first updateJobStatus call was attempted
      expect(mockJobService.updateJobStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multiple Orphans', () => {
    it('should process multiple orphaned jobs in a single sweep', async () => {
      const orphanedJobs = Array.from({ length: 10 }, (_, i) => ({
        id: `job-${i}`,
        started_at: new Date(Date.now() - 60 * 60_000),
      }));

      mockJobService.findOrphanedJobs.mockResolvedValue(orphanedJobs);

      const count = await sweeper.sweep();

      expect(count).toBe(10);
      expect(mockJobService.updateJobStatus).toHaveBeenCalledTimes(10);
    });

    it('should handle empty result from findOrphanedJobs', async () => {
      mockJobService.findOrphanedJobs.mockResolvedValue([]);

      const count = await sweeper.sweep();

      expect(count).toBe(0);
      expect(mockJobService.updateJobStatus).not.toHaveBeenCalled();
    });
  });

  describe('Initial Sweep Behavior', () => {
    it('should run sweep immediately on start without waiting for interval', async () => {
      sweeper.start();

      // The initial sweep runs immediately, before first interval tick
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);

      expect(mockJobService.findOrphanedJobs).toHaveBeenCalledTimes(1);
    });
  });
});
