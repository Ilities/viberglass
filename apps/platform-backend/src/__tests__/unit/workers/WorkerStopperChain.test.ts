import { WorkerStopperChain } from '../../../workers/WorkerStopperChain';
import type { WorkerStopper } from '../../../workers/WorkerStopper';
import type { JobWorker } from '../../../persistence/job/JobWorkerDAO';

const stopper = (workerType: string, stop: WorkerStopper['stop'] = async () => true): WorkerStopper => ({
  name: workerType,
  workerType,
  stop: jest.fn(stop),
});
const recorded = (worker: JobWorker | null) => ({ get: jest.fn().mockResolvedValue(worker) });

describe('WorkerStopperChain', () => {
  it("stops the worker with the stopper for the kind its invoker recorded, and asks no other", async () => {
    const docker = stopper('docker');
    const kubernetes = stopper('kubernetes');
    const worker = { workerType: 'kubernetes', executionId: 'viberator-job-1' };

    await new WorkerStopperChain([docker, kubernetes], recorded(worker)).stop('job-1', 'cancelled');

    expect(kubernetes.stop).toHaveBeenCalledWith('job-1', worker);
    expect(docker.stop).not.toHaveBeenCalled();
  });

  it('does nothing for a job no worker was started for, or a kind that has no stopper', async () => {
    const docker = stopper('docker');
    await new WorkerStopperChain([docker], recorded(null)).stop('job-1', 'cancelled');
    await new WorkerStopperChain([docker], recorded({ workerType: 'lambda', executionId: 'req-1' })).stop('job-1', 'timed out');
    expect(docker.stop).not.toHaveBeenCalled();
  });

  it('never throws, whether the stopper or the lookup fails', async () => {
    const broken = stopper('docker', async () => {
      throw new Error('socket gone');
    });
    await expect(
      new WorkerStopperChain([broken], recorded({ workerType: 'docker', executionId: 'c-1' })).stop('job-1', 'no heartbeat'),
    ).resolves.toBeUndefined();
    await expect(
      new WorkerStopperChain([broken], { get: jest.fn().mockRejectedValue(new Error('database down')) }).stop('job-1', 'cancelled'),
    ).resolves.toBeUndefined();
  });
});
