import { ECSClient, RunTaskCommand, RunTaskCommandOutput, DescribeClustersCommand, DescribeTaskDefinitionCommand } from '@aws-sdk/client-ecs';
import type { Clanker } from '@viberator/types';
import type { JobData } from '../../types/Job';
import { WorkerInvoker, InvocationResult } from '../WorkerInvoker';
import { WorkerError, ErrorClassification } from '../errors/WorkerError';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger({ invoker: 'ECS' });

// Cache for resource availability to avoid repeated checks
const resourceAvailabilityCache = new Map<string, { exists: boolean; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

interface EcsDeploymentConfig {
  clusterArn: string;
  taskDefinitionArn: string;
  launchType?: 'FARGATE' | 'EC2';
  subnetIds: string[];
  securityGroupIds: string[];
  assignPublicIp?: 'ENABLED' | 'DISABLED';
  containerName?: string;
}

export class EcsInvoker implements WorkerInvoker {
  readonly name = 'EcsInvoker';
  private client: ECSClient;

  constructor(config?: { region?: string }) {
    this.client = new ECSClient({
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
    });
  }

  async invoke(job: JobData, clanker: Clanker): Promise<InvocationResult> {
    const ecsConfig = clanker.deploymentConfig as unknown as EcsDeploymentConfig | undefined;

    if (!ecsConfig?.clusterArn || !ecsConfig?.taskDefinitionArn) {
      throw new WorkerError(
        'ECS cluster ARN and task definition ARN required in clanker deploymentConfig',
        ErrorClassification.PERMANENT
      );
    }

    const payload = this.buildPayload(job, clanker);

    try {
      const command = new RunTaskCommand({
        cluster: ecsConfig.clusterArn,
        taskDefinition: ecsConfig.taskDefinitionArn,
        launchType: ecsConfig.launchType || 'FARGATE',
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ecsConfig.subnetIds || [],
            securityGroups: ecsConfig.securityGroupIds || [],
            assignPublicIp: ecsConfig.assignPublicIp || 'DISABLED',
          },
        },
        overrides: {
          containerOverrides: [{
            name: ecsConfig.containerName || 'worker',
            environment: [
              { name: 'JOB_PAYLOAD', value: JSON.stringify(payload) },
              { name: 'TENANT_ID', value: job.tenantId },
              { name: 'JOB_ID', value: job.id },
            ],
          }],
        },
      });

      const response: RunTaskCommandOutput = await this.client.send(command);

      // Check for failures in response
      if (response.failures && response.failures.length > 0) {
        const failure = response.failures[0];
        throw this.classifyEcsFailure(failure);
      }

      const taskArn = response.tasks?.[0]?.taskArn;
      if (!taskArn) {
        throw new WorkerError(
          'ECS RunTask returned no task ARN',
          ErrorClassification.TRANSIENT
        );
      }

      logger.info('Worker task started', {
        jobId: job.id,
        taskArn,
        cluster: ecsConfig.clusterArn,
      });

      return {
        executionId: taskArn,
        workerType: 'ecs',
      };
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      throw this.classifyError(error);
    }
  }

  private classifyEcsFailure(failure: { reason?: string; detail?: string }): WorkerError {
    const reason = failure.reason || '';

    // Transient: AGENT disconnected, capacity issues
    if (reason === 'AGENT' || reason.includes('CAPACITY')) {
      return new WorkerError(
        'ECS task failed to start (transient): ' + reason + ' - ' + failure.detail,
        ErrorClassification.TRANSIENT,
        failure
      );
    }

    // Permanent: RESOURCE, ATTRIBUTE, MISSING, INACTIVE
    return new WorkerError(
      'ECS task failed to start (permanent): ' + reason + ' - ' + failure.detail,
      ErrorClassification.PERMANENT,
      failure
    );
  }

  private classifyError(error: unknown): WorkerError {
    const err = error as { name?: string; message?: string };
    const errorName = err.name || '';

    // Transient errors
    if (errorName === 'ServerException') {
      return new WorkerError(
        'ECS server error (transient): ' + err.message,
        ErrorClassification.TRANSIENT,
        error
      );
    }

    // Permanent: ClusterNotFoundException, InvalidParameterException, etc.
    return new WorkerError(
      'ECS invocation failed (permanent): ' + (errorName || err.message),
      ErrorClassification.PERMANENT,
      error
    );
  }

  private buildPayload(job: JobData, clanker: Clanker): object {
    return {
      workerType: 'ecs',
      tenantId: job.tenantId,
      jobId: job.id,
      clankerId: clanker.id,
      repository: job.repository,
      task: job.task,
      branch: job.branch,
      baseBranch: job.baseBranch,
      context: job.context,
      settings: job.settings,
      deploymentConfig: clanker.deploymentConfig,
    };
  }

  async isAvailable(clanker?: Clanker): Promise<boolean> {
    if (this.client === undefined) {
      return false;
    }

    // If clanker is provided, check if the cluster and task definition exist
    if (clanker) {
      const ecsConfig = clanker.deploymentConfig as unknown as EcsDeploymentConfig | undefined;

      if (!ecsConfig?.clusterArn || !ecsConfig?.taskDefinitionArn) {
        return false;
      }

      const clusterExists = await this.checkClusterExists(ecsConfig.clusterArn);
      if (!clusterExists) {
        return false;
      }

      const taskDefExists = await this.checkTaskDefinitionExists(ecsConfig.taskDefinitionArn);
      return taskDefExists;
    }

    return true;
  }

  private async checkClusterExists(clusterArn: string): Promise<boolean> {
    // Check cache first
    const cacheKey = `cluster:${clusterArn}`;
    const cached = resourceAvailabilityCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.exists;
    }

    try {
      const command = new DescribeClustersCommand({
        clusters: [clusterArn],
      });

      const response = await this.client.send(command);
      const exists = !!(response.clusters && response.clusters.length > 0 && response.clusters[0].status === 'ACTIVE');

      // Cache the result
      resourceAvailabilityCache.set(cacheKey, { exists, timestamp: Date.now() });
      return exists;
    } catch (error) {
      const err = error as { $metadata?: { httpStatusCode?: number } };

      // ClusterNotFoundException means cluster doesn't exist (400)
      if (err.$metadata?.httpStatusCode === 400) {
        resourceAvailabilityCache.set(cacheKey, { exists: false, timestamp: Date.now() });
        return false;
      }

      // Other errors (auth, throttling, etc.) - don't cache, treat as unavailable
      logger.warn('Failed to check ECS cluster existence', {
        clusterArn,
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }

  private async checkTaskDefinitionExists(taskDefArn: string): Promise<boolean> {
    // Check cache first
    const cacheKey = `taskdef:${taskDefArn}`;
    const cached = resourceAvailabilityCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.exists;
    }

    try {
      const command = new DescribeTaskDefinitionCommand({
        taskDefinition: taskDefArn,
      });

      await this.client.send(command);

      // Task definition exists - cache the result
      resourceAvailabilityCache.set(cacheKey, { exists: true, timestamp: Date.now() });
      return true;
    } catch (error) {
      const err = error as { $metadata?: { httpStatusCode?: number } };

      // ResourceNotFoundException means task definition doesn't exist (400)
      if (err.$metadata?.httpStatusCode === 400) {
        resourceAvailabilityCache.set(cacheKey, { exists: false, timestamp: Date.now() });
        return false;
      }

      // Other errors (auth, throttling, etc.) - don't cache, treat as unavailable
      logger.warn('Failed to check ECS task definition existence', {
        taskDefArn,
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }
}
