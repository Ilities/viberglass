import type { Clanker } from '@viberator/types';
import type { JobData } from '../types/Job';

export type WorkerType = 'lambda' | 'ecs' | 'docker';

export interface InvocationResult {
  executionId: string; // AWS Request ID, Task ARN, or Container ID
  workerType: WorkerType;
}

export interface WorkerInvoker {
  readonly name: string;

  /**
   * Invoke worker with job data
   * @returns Execution ID for tracking (does NOT wait for completion)
   * @throws WorkerError with classification (transient vs permanent)
   */
  invoke(job: JobData, clanker: Clanker): Promise<InvocationResult>;

  /**
   * Check if this invoker is properly configured
   * @param clanker - Optional clanker to check specific resource availability
   */
  isAvailable(clanker?: Clanker): Promise<boolean>;
}
