import { WorkerStopperChain } from '../../../workers/WorkerStopperChain';
import type { WorkerStopper } from '../../../workers/WorkerStopper';

const stopper = (name: string, stop: WorkerStopper['stop']): WorkerStopper => ({ name, stop: jest.fn(stop) });

describe('WorkerStopperChain', () => {
  it('stops at the first stopper that had the worker', async () => {
    const docker = stopper('docker', async () => true);
    const ecs = stopper('ecs', async () => true);
    await new WorkerStopperChain([docker, ecs]).stop('job-1', 'cancelled');
    expect(docker.stop).toHaveBeenCalledWith('job-1');
    expect(ecs.stop).not.toHaveBeenCalled();
  });

  it('moves on past a stopper that fails or has no such worker, and never throws', async () => {
    const broken = stopper('broken', async () => {
      throw new Error('socket gone');
    });
    const absent = stopper('absent', async () => false);
    const last = stopper('last', async () => true);
    await expect(new WorkerStopperChain([broken, absent, last]).stop('job-1', 'no heartbeat')).resolves.toBeUndefined();
    expect(last.stop).toHaveBeenCalledWith('job-1');
  });
});
