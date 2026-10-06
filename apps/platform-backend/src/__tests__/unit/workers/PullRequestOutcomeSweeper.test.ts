import { PullRequestOutcomeChecker } from '../../../services/pull-request-outcomes/PullRequestOutcomeChecker';
import { PullRequestOutcomeSweeper } from '../../../workers/PullRequestOutcomeSweeper';
import type { PullRequestOutcome, PullRequestOutcomeSource } from '../../../services/pull-request-outcomes/pullRequestOutcomeTypes';

const URL_1 = 'https://github.com/acme/app/pull/1';
const MERGED: PullRequestOutcome = {
  state: 'merged',
  mergedAt: new Date('2026-09-20T00:00:00Z'),
  closedAt: new Date('2026-09-20T00:00:00Z'),
  commentCount: 1,
  reviewCommentCount: 3,
};

describe('PullRequestOutcomeSweeper', () => {
  const outcomes = {
    listDueForCheck: jest.fn(),
    recordOutcome: jest.fn(),
    recordError: jest.fn(),
  };
  const tokens = { resolve: jest.fn() };
  const source: jest.Mocked<PullRequestOutcomeSource> = {
    supports: jest.fn(),
    fetchOutcome: jest.fn(),
  };
  let sweeper: PullRequestOutcomeSweeper;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    outcomes.listDueForCheck.mockResolvedValue([{ pullRequestUrl: URL_1, projectId: 'project-1' }]);
    tokens.resolve.mockResolvedValue('tok');
    source.supports.mockReturnValue(true);
    source.fetchOutcome.mockResolvedValue(MERGED);
    sweeper = new PullRequestOutcomeSweeper(outcomes, new PullRequestOutcomeChecker(outcomes, tokens, [source]), { recheckAfterMs: 60_000, batchSize: 10 });
  });

  afterEach(() => {
    sweeper.stop();
    jest.useRealTimers();
  });

  it('asks for PRs not checked within the recheck window', async () => {
    await sweeper.sweep();

    const [recheckBefore, limit] = outcomes.listDueForCheck.mock.calls[0];
    expect(Date.now() - (recheckBefore as Date).getTime()).toBe(60_000);
    expect(limit).toBe(10);
  });

  it('records the outcome read with the project token', async () => {
    await expect(sweeper.sweep()).resolves.toBe(1);

    expect(tokens.resolve).toHaveBeenCalledWith('project-1');
    expect(source.fetchOutcome).toHaveBeenCalledWith(URL_1, 'tok');
    expect(outcomes.recordOutcome).toHaveBeenCalledWith(URL_1, MERGED);
    expect(outcomes.recordError).not.toHaveBeenCalled();
  });

  it('records why a check failed, and carries on with the next PR', async () => {
    const URL_2 = 'https://github.com/acme/app/pull/2';
    outcomes.listDueForCheck.mockResolvedValue([
      { pullRequestUrl: URL_1, projectId: 'project-1' },
      { pullRequestUrl: URL_2, projectId: 'project-1' },
    ]);
    source.fetchOutcome.mockRejectedValueOnce(new Error('GitHub returned 404'));

    await expect(sweeper.sweep()).resolves.toBe(1);
    expect(outcomes.recordError).toHaveBeenCalledWith(URL_1, 'GitHub returned 404');
    expect(outcomes.recordOutcome).toHaveBeenCalledWith(URL_2, MERGED);
  });

  it('sweeps on start and on each interval until stopped', async () => {
    outcomes.listDueForCheck.mockResolvedValue([]);
    sweeper = new PullRequestOutcomeSweeper(outcomes, new PullRequestOutcomeChecker(outcomes, tokens, [source]), { sweepIntervalMs: 1_000 });

    sweeper.start();
    expect(sweeper.isRunning()).toBe(true);
    expect(outcomes.listDueForCheck).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(outcomes.listDueForCheck).toHaveBeenCalledTimes(2);

    sweeper.stop();
    expect(sweeper.isRunning()).toBe(false);
  });
});
