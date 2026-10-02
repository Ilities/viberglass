import { TaskMergeCompleter } from '../../../services/pull-request-outcomes/TaskMergeCompleter';
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
    sweeper = new PullRequestOutcomeSweeper(outcomes, tokens, [source], { recheckAfterMs: 60_000, batchSize: 10 });
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

  it('records an error when no source supports the URL', async () => {
    source.supports.mockReturnValue(false);

    await expect(sweeper.sweep()).resolves.toBe(0);
    expect(outcomes.recordError).toHaveBeenCalledWith(URL_1, 'No outcome source supports this URL');
  });

  it('records an error when no project was recorded', async () => {
    outcomes.listDueForCheck.mockResolvedValue([{ pullRequestUrl: URL_1, projectId: null }]);

    await sweeper.sweep();
    expect(outcomes.recordError).toHaveBeenCalledWith(URL_1, 'No project recorded for this pull request');
  });

  it('records an error when the project has no token', async () => {
    tokens.resolve.mockResolvedValue(null);

    await sweeper.sweep();
    expect(source.fetchOutcome).not.toHaveBeenCalled();
    expect(outcomes.recordError).toHaveBeenCalledWith(URL_1, 'Project has no SCM token credential');
  });

  it('records a failed fetch and carries on with the next PR', async () => {
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
    sweeper = new PullRequestOutcomeSweeper(outcomes, tokens, [source], { sweepIntervalMs: 1_000 });

    sweeper.start();
    expect(sweeper.isRunning()).toBe(true);
    expect(outcomes.listDueForCheck).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(outcomes.listDueForCheck).toHaveBeenCalledTimes(2);

    sweeper.stop();
    expect(sweeper.isRunning()).toBe(false);
  });

  it('closes the task a merged pull request belongs to, through the merge completer', async () => {
    const tasks = { listOpenTaskIds: jest.fn().mockResolvedValue(['task-1']) };
    const tickets = { updateTicket: jest.fn() };
    const activity = { record: jest.fn() };
    const completer = new TaskMergeCompleter({ tasks, tickets, activity });
    source.fetchOutcome.mockResolvedValue({ ...MERGED, mergedBy: 'dev-koskinen' });
    const withListener = new PullRequestOutcomeSweeper(outcomes, tokens, [source], { recheckAfterMs: 60_000 }, [completer]);

    await expect(withListener.sweep()).resolves.toBe(1);

    expect(tasks.listOpenTaskIds).toHaveBeenCalledWith(URL_1);
    expect(tickets.updateTicket).toHaveBeenCalledWith('task-1', { status: 'resolved' });
    expect(activity.record).toHaveBeenCalledWith('task-1', { type: 'system' }, 'pull_request_merged', {
      pullRequestUrl: URL_1,
      merged: true,
      mergedBy: 'dev-koskinen',
    });
  });

  it('leaves tasks open for a pull request that is still open or was closed unmerged', async () => {
    const tasks = { listOpenTaskIds: jest.fn().mockResolvedValue(['task-1']) };
    const tickets = { updateTicket: jest.fn() };
    const completer = new TaskMergeCompleter({ tasks, tickets, activity: { record: jest.fn() } });

    await completer.onOutcome(URL_1, { ...MERGED, state: 'open', mergedAt: null });
    await completer.onOutcome(URL_1, { ...MERGED, state: 'closed', mergedAt: null });

    expect(tickets.updateTicket).not.toHaveBeenCalled();
  });

  it('still records the outcome when a listener fails', async () => {
    const failing = { onOutcome: jest.fn().mockRejectedValue(new Error('database gone')) };
    const withListener = new PullRequestOutcomeSweeper(outcomes, tokens, [source], {}, [failing]);

    await expect(withListener.sweep()).resolves.toBe(1);
    expect(outcomes.recordOutcome).toHaveBeenCalledWith(URL_1, MERGED);
    expect(outcomes.recordError).not.toHaveBeenCalled();
  });
});
