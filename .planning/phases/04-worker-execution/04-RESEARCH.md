# Phase 4: Worker Execution - Research

**Researched:** 2026-01-19
**Domain:** Platform-side worker invocation using AWS SDK v3 (Lambda, ECS) and dockerode (Docker)
**Confidence:** HIGH

## Summary

This phase implements the platform-side invocation of workers via AWS Lambda, ECS RunTask, and local Docker. The key architectural decisions from CONTEXT.md are: single `WorkerInvoker` interface for all worker types, async-only invocation (fire-and-forget), and retry based on error classification (transient vs permanent). The codebase already has a factory pattern established in `CredentialProviderFactory` that can serve as a template for `WorkerInvokerFactory`.

The implementation uses AWS SDK v3 for Lambda/ECS invocation and dockerode for local Docker. Lambda invocation uses `InvocationType: 'Event'` for true async (returns 202, no response payload). ECS uses `RunTaskCommand` which is inherently async (returns task ARN, task runs independently). Docker uses `container.start()` which returns immediately after starting.

**Primary recommendation:** Create `WorkerInvoker` interface with `invoke(job, clankerConfig): Promise<string>` returning execution ID. Implement `LambdaInvoker`, `EcsInvoker`, `DockerInvoker`. Use error classification to determine transient (retry) vs permanent (fail immediately) errors. Implement background sweep using simple `setInterval` with proper cleanup.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-lambda` | ^3.450.0 | Lambda async invocation | Official AWS SDK v3, matches existing @aws-sdk/client-ssm pattern |
| `@aws-sdk/client-ecs` | ^3.450.0 | ECS RunTask API | Official AWS SDK v3 for ECS |
| `dockerode` | ^4.0.0 | Docker container management | De-facto Node.js Docker SDK, 12k+ GitHub stars |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@aws-sdk/client-ssm` | ^3.450.0 | Already in platform | Existing credential fetching |
| `uuid` | ^9.0.1 | Already in platform | Generate execution IDs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dockerode | child_process.spawn('docker', [...]) | CLI approach simpler but less type-safe; dockerode provides events, logs, streaming |
| AWS SDK v3 | AWS SDK v2 | v2 in maintenance mode (EOL 09/2025), v3 is modular and actively maintained |
| Custom retry | AWS SDK built-in retry | Built-in retry handles throttling automatically but we need custom error classification |

**Installation:**
```bash
cd /home/jussi/Development/viberator/platform/backend
npm install @aws-sdk/client-lambda @aws-sdk/client-ecs dockerode @types/dockerode
```

## Architecture Patterns

### Recommended Project Structure
```
platform/backend/src/
├── workers/
│   ├── WorkerInvoker.ts          # Interface definition
│   ├── WorkerInvokerFactory.ts   # Factory pattern (mirrors CredentialProviderFactory)
│   ├── invokers/
│   │   ├── LambdaInvoker.ts      # AWS Lambda invocation
│   │   ├── EcsInvoker.ts         # AWS ECS RunTask
│   │   └── DockerInvoker.ts      # Local Docker execution
│   ├── errors/
│   │   └── WorkerError.ts        # Error classification (transient vs permanent)
│   └── sweep/
│       └── OrphanSweeper.ts      # Background sweep for orphan detection
└── types/
    └── worker.ts                 # Worker payload, config types
```

### Pattern 1: WorkerInvoker Interface

**What:** Single interface for all worker types with consistent invoke() signature

**When to use:** Platform invokes any worker type polymorphically

**Example:**
```typescript
// Source: Based on CONTEXT.md decisions and existing CredentialProvider pattern

import { Clanker } from '@viberglass/types';
import { JobData } from '../types/Job';

/**
 * Result of invoking a worker
 * Contains execution ID for tracking/debugging
 */
export interface InvocationResult {
  executionId: string;  // AWS Request ID, Task ARN, or Container ID
  workerType: 'lambda' | 'ecs' | 'docker';
}

/**
 * WorkerInvoker interface - all worker types implement this
 * Async-only: invoke() returns immediately, results via callback (Phase 2)
 */
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
   */
  isAvailable(): Promise<boolean>;
}
```

### Pattern 2: LambdaInvoker Implementation

**What:** AWS Lambda async invocation using InvocationType: 'Event'

**When to use:** Lambda-deployed clankers

**Example:**
```typescript
// Source: AWS SDK v3 documentation
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/

import { LambdaClient, InvokeCommand, InvokeCommandOutput } from '@aws-sdk/client-lambda';
import { WorkerInvoker, InvocationResult } from '../WorkerInvoker';
import { WorkerError, ErrorClassification } from '../errors/WorkerError';

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
    const payload = this.buildPayload(job, clanker);

    try {
      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',  // Async - returns 202, no response payload
        Payload: Buffer.from(JSON.stringify(payload)),
      });

      const response: InvokeCommandOutput = await this.client.send(command);

      // For async invocation, RequestId is the execution ID
      const executionId = response.$metadata.requestId || 'unknown';

      console.info('[LambdaInvoker] Worker invoked', {
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
    const errorName = (error as { name?: string }).name || '';
    const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;

    // Transient errors - can be retried
    const transientErrors = [
      'TooManyRequestsException',
      'ServiceException',
      'EC2ThrottledException',
      'EC2UnexpectedException',
      'ResourceNotReadyException',
      'ResourceConflictException',
      'SnapStartNotReadyException',
      'SnapStartTimeoutException',
      'EFSIOException',
      'EFSMountConnectivityException',
      'EFSMountTimeoutException',
    ];

    if (transientErrors.includes(errorName) || (statusCode && statusCode >= 500)) {
      return new WorkerError(
        `Lambda invocation failed (transient): ${errorName}`,
        ErrorClassification.TRANSIENT,
        error
      );
    }

    // Permanent errors - do not retry
    return new WorkerError(
      `Lambda invocation failed (permanent): ${errorName}`,
      ErrorClassification.PERMANENT,
      error
    );
  }

  private getFunctionName(clanker: Clanker): string {
    const config = clanker.deploymentConfig as { functionName?: string; functionArn?: string };
    return config?.functionArn || config?.functionName || '';
  }

  private buildPayload(job: JobData, clanker: Clanker): object {
    // Build payload per Phase 3 LambdaPayload interface
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
      // Add S3 URLs for instruction files, credential variable names, etc.
      deploymentConfig: clanker.deploymentConfig,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple availability check - client initialization succeeded
      return this.client !== undefined;
    } catch {
      return false;
    }
  }
}
```

### Pattern 3: EcsInvoker Implementation

**What:** AWS ECS RunTask for container-based workers

**When to use:** ECS-deployed clankers (Fargate or EC2)

**Example:**
```typescript
// Source: AWS SDK v3 ECS documentation
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/RunTaskCommand/

import { ECSClient, RunTaskCommand, RunTaskCommandOutput } from '@aws-sdk/client-ecs';
import { WorkerInvoker, InvocationResult } from '../WorkerInvoker';
import { WorkerError, ErrorClassification } from '../errors/WorkerError';

export class EcsInvoker implements WorkerInvoker {
  readonly name = 'EcsInvoker';
  private client: ECSClient;

  constructor(config?: { region?: string }) {
    this.client = new ECSClient({
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
    });
  }

  async invoke(job: JobData, clanker: Clanker): Promise<InvocationResult> {
    const ecsConfig = clanker.deploymentConfig as EcsDeploymentConfig;
    const payload = this.buildPayload(job, clanker);

    try {
      const command = new RunTaskCommand({
        cluster: ecsConfig.clusterArn,
        taskDefinition: ecsConfig.taskDefinitionArn,
        launchType: ecsConfig.launchType || 'FARGATE',
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ecsConfig.subnetIds,
            securityGroups: ecsConfig.securityGroupIds,
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

      // Task ARN is the execution ID
      const taskArn = response.tasks?.[0]?.taskArn || 'unknown';

      console.info('[EcsInvoker] Worker task started', {
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

    // Transient: AGENT disconnected
    if (reason === 'AGENT') {
      return new WorkerError(
        `ECS agent disconnected: ${failure.detail}`,
        ErrorClassification.TRANSIENT,
        failure
      );
    }

    // Permanent: RESOURCE:*, ATTRIBUTE, LOCATION, MISSING, INACTIVE
    return new WorkerError(
      `ECS task failed to start: ${reason} - ${failure.detail}`,
      ErrorClassification.PERMANENT,
      failure
    );
  }

  private classifyError(error: unknown): WorkerError {
    const errorName = (error as { name?: string }).name || '';

    // Transient errors
    if (errorName === 'ServerException') {
      return new WorkerError(
        `ECS server error (transient): ${errorName}`,
        ErrorClassification.TRANSIENT,
        error
      );
    }

    // Permanent errors: ClusterNotFoundException, InvalidParameterException, etc.
    return new WorkerError(
      `ECS invocation failed (permanent): ${errorName}`,
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

  async isAvailable(): Promise<boolean> {
    return this.client !== undefined;
  }
}

interface EcsDeploymentConfig {
  clusterArn: string;
  taskDefinitionArn: string;
  launchType?: 'FARGATE' | 'EC2';
  subnetIds: string[];
  securityGroupIds: string[];
  assignPublicIp?: 'ENABLED' | 'DISABLED';
  containerName?: string;
}
```

### Pattern 4: DockerInvoker Implementation

**What:** Local Docker container execution using dockerode

**When to use:** Local development or self-hosted Docker workers

**Example:**
```typescript
// Source: https://github.com/apocas/dockerode

import Docker from 'dockerode';
import { WorkerInvoker, InvocationResult } from '../WorkerInvoker';
import { WorkerError, ErrorClassification } from '../errors/WorkerError';

export class DockerInvoker implements WorkerInvoker {
  readonly name = 'DockerInvoker';
  private docker: Docker;

  constructor(config?: { socketPath?: string; host?: string; port?: number }) {
    this.docker = new Docker({
      socketPath: config?.socketPath || '/var/run/docker.sock',
      host: config?.host,
      port: config?.port,
    });
  }

  async invoke(job: JobData, clanker: Clanker): Promise<InvocationResult> {
    const dockerConfig = clanker.deploymentConfig as DockerDeploymentConfig;
    const payload = this.buildPayload(job, clanker);

    try {
      // Create container
      const container = await this.docker.createContainer({
        Image: dockerConfig.containerImage,
        name: `viberator-job-${job.id}`,
        Env: [
          `JOB_PAYLOAD=${JSON.stringify(payload)}`,
          `TENANT_ID=${job.tenantId}`,
          `JOB_ID=${job.id}`,
          ...this.formatEnvironmentVars(dockerConfig.environmentVariables),
        ],
        HostConfig: {
          AutoRemove: true,  // Clean up after completion
          NetworkMode: dockerConfig.networkMode || 'bridge',
        },
      });

      // Start container (async - returns immediately)
      await container.start();

      // Container ID is the execution ID
      const containerId = container.id;

      console.info('[DockerInvoker] Container started', {
        jobId: job.id,
        containerId,
        image: dockerConfig.containerImage,
      });

      return {
        executionId: containerId,
        workerType: 'docker',
      };
    } catch (error) {
      throw this.classifyError(error);
    }
  }

  private classifyError(error: unknown): WorkerError {
    const message = (error as Error).message || '';

    // Transient: Docker daemon unavailable, network issues
    if (
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('socket hang up')
    ) {
      return new WorkerError(
        `Docker daemon connection failed (transient): ${message}`,
        ErrorClassification.TRANSIENT,
        error
      );
    }

    // Permanent: Image not found, invalid config
    return new WorkerError(
      `Docker container failed (permanent): ${message}`,
      ErrorClassification.PERMANENT,
      error
    );
  }

  private formatEnvironmentVars(vars?: Record<string, string>): string[] {
    if (!vars) return [];
    return Object.entries(vars).map(([key, value]) => `${key}=${value}`);
  }

  private buildPayload(job: JobData, clanker: Clanker): object {
    return {
      workerType: 'docker',
      tenantId: job.tenantId,
      jobId: job.id,
      clankerId: clanker.id,
      repository: job.repository,
      task: job.task,
      branch: job.branch,
      baseBranch: job.baseBranch,
      context: job.context,
      settings: job.settings,
      clankerConfig: clanker,  // Full config for Docker (no external storage)
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }
}

interface DockerDeploymentConfig {
  containerImage: string;
  environmentVariables?: Record<string, string>;
  networkMode?: string;
}
```

### Pattern 5: WorkerInvokerFactory

**What:** Factory pattern for getting typed invoker by worker type

**When to use:** Platform needs to invoke worker for a clanker

**Example:**
```typescript
// Source: Mirrors existing CredentialProviderFactory pattern

import { WorkerInvoker } from './WorkerInvoker';
import { LambdaInvoker } from './invokers/LambdaInvoker';
import { EcsInvoker } from './invokers/EcsInvoker';
import { DockerInvoker } from './invokers/DockerInvoker';

export type WorkerType = 'lambda' | 'ecs' | 'docker';

export interface WorkerInvokerConfig {
  lambda?: { region?: string };
  ecs?: { region?: string };
  docker?: { socketPath?: string; host?: string; port?: number };
}

/**
 * Factory for getting worker invokers by type
 * Singleton pattern - invokers are reused across invocations
 */
export class WorkerInvokerFactory {
  private invokers: Map<WorkerType, WorkerInvoker> = new Map();

  constructor(config: WorkerInvokerConfig = {}) {
    this.initializeInvokers(config);
  }

  private initializeInvokers(config: WorkerInvokerConfig): void {
    // Initialize all invoker types
    this.invokers.set('lambda', new LambdaInvoker(config.lambda));
    this.invokers.set('ecs', new EcsInvoker(config.ecs));
    this.invokers.set('docker', new DockerInvoker(config.docker));

    console.info('[WorkerInvokerFactory] Initialized invokers:', {
      types: Array.from(this.invokers.keys()),
    });
  }

  /**
   * Get invoker for worker type
   * @throws Error if worker type not supported
   */
  getInvoker(workerType: WorkerType): WorkerInvoker {
    const invoker = this.invokers.get(workerType);
    if (!invoker) {
      throw new Error(`Unsupported worker type: ${workerType}`);
    }
    return invoker;
  }

  /**
   * Get invoker from clanker's deployment strategy
   */
  getInvokerForClanker(clanker: Clanker): WorkerInvoker {
    const strategyName = clanker.deploymentStrategy?.name as WorkerType;
    return this.getInvoker(strategyName);
  }
}

// Singleton instance
let factoryInstance: WorkerInvokerFactory | null = null;

export function getWorkerInvokerFactory(config?: WorkerInvokerConfig): WorkerInvokerFactory {
  if (!factoryInstance) {
    factoryInstance = new WorkerInvokerFactory(config);
  }
  return factoryInstance;
}
```

### Pattern 6: Error Classification

**What:** Classify errors as transient (retry) vs permanent (fail immediately)

**When to use:** Decide retry behavior after invocation failure

**Example:**
```typescript
// Source: AWS documentation on error types

export enum ErrorClassification {
  TRANSIENT = 'transient',   // Can be retried (throttling, network, server errors)
  PERMANENT = 'permanent',   // Should not be retried (config, permission errors)
}

export class WorkerError extends Error {
  constructor(
    message: string,
    public readonly classification: ErrorClassification,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'WorkerError';
  }

  get isTransient(): boolean {
    return this.classification === ErrorClassification.TRANSIENT;
  }

  get isPermanent(): boolean {
    return this.classification === ErrorClassification.PERMANENT;
  }
}
```

### Pattern 7: Background Orphan Sweep

**What:** Periodic check for jobs stuck in 'active' state past timeout

**When to use:** Safety net when workers fail to callback

**Example:**
```typescript
// Source: Node.js setInterval best practices

import { JobService } from '../services/JobService';

export class OrphanSweeper {
  private intervalId: NodeJS.Timeout | null = null;
  private jobService: JobService;
  private sweepIntervalMs: number;
  private jobTimeoutMs: number;

  constructor(config?: {
    sweepIntervalMs?: number;  // How often to check (default: 60 seconds)
    jobTimeoutMs?: number;      // Job considered orphaned after (default: 30 minutes)
  }) {
    this.jobService = new JobService();
    this.sweepIntervalMs = config?.sweepIntervalMs || 60_000;      // 1 minute
    this.jobTimeoutMs = config?.jobTimeoutMs || 30 * 60_000;       // 30 minutes
  }

  /**
   * Start the background sweep
   */
  start(): void {
    if (this.intervalId) {
      console.warn('[OrphanSweeper] Already running');
      return;
    }

    console.info('[OrphanSweeper] Starting orphan detection sweep', {
      sweepIntervalMs: this.sweepIntervalMs,
      jobTimeoutMs: this.jobTimeoutMs,
    });

    this.intervalId = setInterval(() => {
      this.sweep().catch((error) => {
        console.error('[OrphanSweeper] Sweep failed', { error });
      });
    }, this.sweepIntervalMs);
  }

  /**
   * Stop the background sweep (important for clean shutdown)
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.info('[OrphanSweeper] Stopped');
    }
  }

  /**
   * Run a single sweep iteration
   */
  async sweep(): Promise<void> {
    const cutoffTime = new Date(Date.now() - this.jobTimeoutMs);

    console.debug('[OrphanSweeper] Running sweep', { cutoffTime });

    // Find jobs that started before cutoff and are still active
    const orphanedJobs = await this.findOrphanedJobs(cutoffTime);

    for (const job of orphanedJobs) {
      console.warn('[OrphanSweeper] Marking job as timed out', {
        jobId: job.id,
        startedAt: job.started_at,
      });

      await this.jobService.updateJobStatus(job.id, 'failed', {
        errorMessage: `Job timed out after ${this.jobTimeoutMs / 1000}s without callback`,
      });
    }

    if (orphanedJobs.length > 0) {
      console.info('[OrphanSweeper] Sweep completed', {
        orphanedCount: orphanedJobs.length,
      });
    }
  }

  private async findOrphanedJobs(cutoffTime: Date): Promise<Array<{ id: string; started_at: Date }>> {
    // Query jobs table for active jobs started before cutoff
    // Implementation depends on database access pattern
    return [];  // Placeholder - implement with Kysely query
  }
}
```

### Anti-Patterns to Avoid

- **Waiting for async invocation response:** Lambda Event invocation returns 202 immediately; don't await worker completion
- **Retrying permanent errors:** ResourceNotFoundException, InvalidParameterException should fail immediately
- **Leaking setInterval references:** Always store intervalId and call clearInterval on shutdown
- **Hardcoding deployment config:** Read from clanker.deploymentConfig per CONTEXT.md
- **Mixing sync and async Lambda invocation:** Always use InvocationType: 'Event' for worker invocation

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lambda invocation | Raw HTTP calls to AWS API | `@aws-sdk/client-lambda` InvokeCommand | Handles auth, region, retries, credential chain |
| ECS task launch | Custom HTTP calls | `@aws-sdk/client-ecs` RunTaskCommand | Handles complex request structure, error types |
| Docker container management | child_process.spawn('docker') | `dockerode` | Type-safe, events, streaming, cross-platform |
| AWS SDK error classification | Manual HTTP status parsing | Check error.name against known error lists | AWS defines specific exception names |
| Retry with backoff | Custom setTimeout loops | Existing exponential backoff pattern (Phase 2) | `delay * 2^attempt` already established |

**Key insight:** AWS SDK v3 returns structured errors with `$metadata.httpStatusCode` and typed exception names, making classification straightforward.

## Common Pitfalls

### Pitfall 1: Confusing sync vs async Lambda invocation

**What goes wrong:** Using RequestResponse (default) instead of Event, platform blocks waiting for worker to complete.

**Why it happens:** InvokeCommand defaults to synchronous invocation.

**How to avoid:**
- Always explicitly set `InvocationType: 'Event'`
- Verify 202 status code in response (not 200)
- Never read response.Payload for async invocations

**Warning signs:** Platform response time equals worker execution time

### Pitfall 2: ECS RunTask failures in response body

**What goes wrong:** RunTask returns 200 but `response.failures[]` contains task launch errors.

**Why it happens:** ECS separates request success from task success.

**How to avoid:**
- Always check `response.failures` array
- Extract failure.reason and failure.detail for error classification
- Only use `response.tasks[0].taskArn` if no failures

**Warning signs:** Job marked as running but ECS shows no tasks

### Pitfall 3: Memory leaks from setInterval in orphan sweeper

**What goes wrong:** Interval continues running after server shutdown, preventing garbage collection.

**Why it happens:** Not calling clearInterval on process exit.

**How to avoid:**
- Store intervalId in class property
- Implement stop() method that calls clearInterval
- Call stop() in process shutdown handlers (SIGTERM, SIGINT)
- Consider using AbortController for modern approach

**Warning signs:** Memory growth over time, duplicate sweep logs

### Pitfall 4: Retrying permanent errors

**What goes wrong:** Platform keeps retrying ResourceNotFoundException, wasting resources.

**Why it happens:** Not classifying errors before retry logic.

**How to avoid:**
- Check error.name against permanent error list
- Immediately fail jobs with permanent errors
- Only retry transient errors (throttling, network, 5xx)

**Warning signs:** Jobs retrying indefinitely with same error

### Pitfall 5: Docker container name collisions

**What goes wrong:** createContainer fails because container with same name exists.

**Why it happens:** Previous container didn't get removed (AutoRemove failed).

**How to avoid:**
- Use unique container names: `viberator-job-${job.id}`
- Set `AutoRemove: true` in HostConfig
- Optionally prefix with timestamp for uniqueness

**Warning signs:** "Conflict. The container name is already in use"

## Code Examples

Verified patterns from official sources:

### Lambda Async Invocation
```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const client = new LambdaClient({ region: 'us-east-1' });

const command = new InvokeCommand({
  FunctionName: 'my-function',
  InvocationType: 'Event',  // Async - returns 202 immediately
  Payload: Buffer.from(JSON.stringify({ jobId: '123', task: 'fix-bug' })),
});

const response = await client.send(command);
// response.StatusCode === 202
// response.$metadata.requestId is the execution ID
```

### ECS RunTask with Environment Override
```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/RunTaskCommand/

import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';

const client = new ECSClient({ region: 'us-east-1' });

const command = new RunTaskCommand({
  cluster: 'my-cluster',
  taskDefinition: 'my-task:1',
  launchType: 'FARGATE',
  networkConfiguration: {
    awsvpcConfiguration: {
      subnets: ['subnet-xxx'],
      securityGroups: ['sg-xxx'],
      assignPublicIp: 'ENABLED',
    },
  },
  overrides: {
    containerOverrides: [{
      name: 'worker',
      environment: [
        { name: 'JOB_ID', value: '123' },
        { name: 'JOB_PAYLOAD', value: JSON.stringify({ task: 'fix-bug' }) },
      ],
    }],
  },
});

const response = await client.send(command);
// response.tasks[0].taskArn is the execution ID
// Check response.failures for launch errors
```

### Dockerode Container Creation
```typescript
// Source: https://github.com/apocas/dockerode

import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const container = await docker.createContainer({
  Image: 'my-worker:latest',
  name: 'viberator-job-123',
  Env: [
    'JOB_ID=123',
    'JOB_PAYLOAD={"task":"fix-bug"}',
  ],
  HostConfig: {
    AutoRemove: true,
    NetworkMode: 'bridge',
  },
});

await container.start();
// container.id is the execution ID
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AWS SDK v2 | AWS SDK v3 | v3 stable since 2022, v2 EOL 09/2025 | Modular imports, better TypeScript, smaller bundles |
| Sync Lambda invocation | Async (Event) invocation | Always for fire-and-forget | Platform doesn't block; results via callback |
| Manual retry loops | Error classification first | Phase 4 decision | Only retry transient errors |
| No orphan detection | Background sweep | Phase 4 | Safety net for failed callbacks |

**Deprecated/outdated:**
- AWS SDK v2 (`aws-sdk` package): In maintenance mode, EOL September 2025
- Lambda sync invocation for workers: Use Event type for async
- Manual HTTP calls to AWS APIs: Use official SDK clients

## Open Questions

Things that couldn't be fully resolved:

1. **Sweep interval tuning**
   - What we know: 60-second interval is reasonable starting point
   - What's unclear: Optimal balance between detection latency and database load
   - Recommendation: Start with 60s, make configurable, adjust based on monitoring

2. **Job timeout duration**
   - What we know: Workers have `settings.maxExecutionTime` per job
   - What's unclear: Should platform timeout be per-job or global?
   - Recommendation: Use job's maxExecutionTime + 5 minute buffer, fall back to 30 minutes

3. **Docker networking for local development**
   - What we know: Containers need to reach platform callback URL
   - What's unclear: Whether to use host networking, custom bridge, or service discovery
   - Recommendation: Default to bridge network; document callback URL configuration

4. **Lambda function name vs ARN**
   - What we know: Both work for InvokeCommand
   - What's unclear: Whether to standardize on one format
   - Recommendation: Store full ARN in deploymentConfig; ARN is unambiguous across regions

## Sources

### Primary (HIGH confidence)
- [AWS SDK for JavaScript v3 Lambda Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/) - InvokeCommand documentation
- [AWS SDK for JavaScript v3 ECS Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/RunTaskCommand/) - RunTaskCommand documentation
- [Lambda Invoke API Reference](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html) - Error codes and InvocationType options
- [Amazon ECS API Failure Reasons](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/api_failures_messages.html) - RunTask failure classification
- [AWS SDK v3 Error Handling](https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/ERROR_HANDLING.md) - Error type checking patterns
- [dockerode GitHub](https://github.com/apocas/dockerode) - Node.js Docker SDK documentation
- Existing codebase:
  - `/home/jussi/Development/viberator/platform/backend/src/credentials/CredentialProviderFactory.ts` - Factory pattern template
  - `/home/jussi/Development/viberator/viberator/app/src/workers/CallbackClient.ts` - Exponential backoff retry pattern

### Secondary (MEDIUM confidence)
- [AWS re:Post - ECS API Common Errors](https://repost.aws/knowledge-center/ecs-api-common-errors) - Troubleshooting guide
- [Node.js Timeouts and Memory Leaks](https://lucumr.pocoo.org/2024/6/5/node-timeout/) - setInterval best practices

### Tertiary (LOW confidence)
- WebSearch results on error classification - verified against official AWS docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - AWS SDK v3 verified via official docs, dockerode well-established
- Architecture: HIGH - Factory pattern mirrors existing codebase, error classification from AWS docs
- Pitfalls: HIGH - Identified from official documentation and established patterns

**Research date:** 2026-01-19
**Valid until:** 2026-02-18 (30 days - AWS SDK patterns stable)
