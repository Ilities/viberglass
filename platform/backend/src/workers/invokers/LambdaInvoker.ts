import { LambdaClient, InvokeCommand, InvokeCommandOutput, GetFunctionCommand } from '@aws-sdk/client-lambda';
import type { Clanker } from '@viberator/types';
import type { JobData } from '../../types/Job';
import { WorkerInvoker, InvocationResult } from '../WorkerInvoker';
import { WorkerError, ErrorClassification } from '../errors/WorkerError';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger({ invoker: 'Lambda' });

// Cache for function availability to avoid repeated checks
const functionAvailabilityCache = new Map<string, { exists: boolean; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

interface LambdaDeploymentConfig {
  functionName?: string;
  functionArn?: string;
}

export class LambdaInvoker implements WorkerInvoker {
  readonly name = 'LambdaInvoker';
  private client: LambdaClient;

  constructor(config?: { region?: string }) {
    this.client = new LambdaClient({
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
    });
  }

  async invoke(job: JobData, clanker: Clanker): Promise<InvocationResult> {
    const functionName = this.getFunctionName(clanker);
    if (!functionName) {
      throw new WorkerError(
        'Lambda function name or ARN not configured in clanker deploymentConfig',
        ErrorClassification.PERMANENT
      );
    }

    const payload = this.buildPayload(job, clanker);

    try {
      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',  // Async - returns 202, no response payload
        Payload: Buffer.from(JSON.stringify(payload)),
      });

      const response: InvokeCommandOutput = await this.client.send(command);

      const executionId = response.$metadata.requestId || 'lambda-' + Date.now();

      logger.info('Worker invoked', {
        jobId: job.id,
        functionName,
        executionId,
        statusCode: response.StatusCode,  // Should be 202 for Event
      });

      return {
        executionId,
        workerType: 'lambda',
      };
    } catch (error) {
      throw this.classifyError(error, functionName);
    }
  }

  private classifyError(error: unknown, functionName: string): WorkerError {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
    const errorName = err.name || '';
    const statusCode = err.$metadata?.httpStatusCode;

    // Transient errors - can be retried
    const transientErrors = [
      'TooManyRequestsException',
      'ServiceException',
      'EC2ThrottledException',
      'EC2UnexpectedException',
      'ResourceNotReadyException',
      'ResourceConflictException',
      'EFSIOException',
      'EFSMountConnectivityException',
      'EFSMountTimeoutException',
    ];

    if (transientErrors.includes(errorName) || (statusCode && statusCode >= 500)) {
      return new WorkerError(
        'Lambda invocation failed (transient): ' + (errorName || err.message),
        ErrorClassification.TRANSIENT,
        error
      );
    }

    // Permanent errors - do not retry
    return new WorkerError(
      'Lambda invocation failed (permanent): ' + (errorName || err.message),
      ErrorClassification.PERMANENT,
      error
    );
  }

  private getFunctionName(clanker: Clanker): string | undefined {
    const config = clanker.deploymentConfig as unknown as LambdaDeploymentConfig | undefined;
    return config?.functionArn || config?.functionName;
  }

  private buildPayload(job: JobData, clanker: Clanker): object {
    return {
      workerType: 'lambda',
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

    // If clanker is provided, check if the function exists
    if (clanker) {
      const functionName = this.getFunctionName(clanker);
      if (!functionName) {
        return false;
      }

      return await this.checkFunctionExists(functionName);
    }

    return true;
  }

  private async checkFunctionExists(functionName: string): Promise<boolean> {
    // Check cache first
    const cached = functionAvailabilityCache.get(functionName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.exists;
    }

    try {
      const command = new GetFunctionCommand({
        FunctionName: functionName,
      });

      await this.client.send(command);

      // Function exists - cache the result
      functionAvailabilityCache.set(functionName, { exists: true, timestamp: Date.now() });
      return true;
    } catch (error) {
      const err = error as { $metadata?: { httpStatusCode?: number } };

      // ResourceNotFoundException means function doesn't exist (404)
      if (err.$metadata?.httpStatusCode === 404) {
        functionAvailabilityCache.set(functionName, { exists: false, timestamp: Date.now() });
        return false;
      }

      // Other errors (auth, throttling, etc.) - don't cache, treat as unavailable
      logger.warn('Failed to check Lambda function existence', {
        functionName,
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }
}
