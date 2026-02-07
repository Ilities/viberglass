import { APIRequestContext } from '@playwright/test';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { ECSClient, DescribeTasksCommand, ListTasksCommand } from '@aws-sdk/client-ecs';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

export interface AWSTestContext {
  tenantId: string;
  apiUrl: string;
  frontendUrl: string;
  region: string;
  accountId: string;
  apiKey?: string;
}

export interface TestProject {
  id: string;
  name: string;
  description: string;
  tenant_id: string;
}

export interface TestTicket {
  id: string;
  title: string;
  description: string;
  project_id: string;
  severity: string;
}

export interface TestJob {
  id: string;
  ticket_id: string;
  status: string;
  task_arn?: string;
}

/**
 * Setup AWS test context from environment variables
 */
export function setupAWSTest(): AWSTestContext {
  const context: AWSTestContext = {
    tenantId: process.env.TEST_TENANT_ID || 'staging-e2e-test',
    apiUrl: process.env.AWS_API_URL || 'https://api.staging.yourdomain.com',
    frontendUrl: process.env.AWS_FRONTEND_URL || 'https://staging.yourdomain.com',
    region: process.env.AWS_REGION || 'us-east-1',
    accountId: process.env.AWS_ACCOUNT_ID || '',
    apiKey: process.env.TEST_API_KEY,
  };

  // Validate required environment variables
  if (!context.apiUrl) {
    throw new Error('AWS_API_URL environment variable is required');
  }

  return context;
}

/**
 * Create a test project via API
 */
export async function createTestProject(
  request: APIRequestContext,
  tenantId: string,
  name?: string
): Promise<TestProject> {
  const projectName = name || `E2E Test Project ${uuidv4().substring(0, 8)}`;

  const response = await request.post('/api/projects', {
    data: {
      name: projectName,
      description: 'Automated E2E test project',
      tenant_id: tenantId,
    },
    headers: {
      'X-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create project: ${response.status()} ${await response.text()}`);
  }

  return await response.json();
}

/**
 * Create a test ticket via API
 */
export async function createTestTicket(
  request: APIRequestContext,
  projectId: string,
  tenantId: string,
  title?: string
): Promise<TestTicket> {
  const ticketTitle = title || `E2E Test Ticket ${uuidv4().substring(0, 8)}`;

  const response = await request.post('/api/tickets', {
    data: {
      title: ticketTitle,
      description: 'Automated E2E test ticket - please implement feature X',
      project_id: projectId,
      severity: 'medium',
    },
    headers: {
      'X-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create ticket: ${response.status()} ${await response.text()}`);
  }

  return await response.json();
}

/**
 * Trigger Viberator execution for a ticket
 */
export async function triggerViberatorExecution(
  request: APIRequestContext,
  ticketId: string,
  tenantId: string
): Promise<TestJob> {
  const response = await request.post(`/api/tickets/${ticketId}/execute`, {
    headers: {
      'X-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to trigger execution: ${response.status()} ${await response.text()}`);
  }

  return await response.json();
}

/**
 * Wait for job to complete with polling
 */
export async function waitForJobCompletion(
  request: APIRequestContext,
  jobId: string,
  tenantId: string,
  timeoutMs: number = 300000 // 5 minutes
): Promise<TestJob> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    const response = await request.get(`/api/jobs/${jobId}`, {
      headers: {
        'X-Tenant-Id': tenantId,
      },
    });

    if (!response.ok()) {
      throw new Error(`Failed to fetch job: ${response.status()} ${await response.text()}`);
    }

    const job: TestJob = await response.json();

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

/**
 * Get CloudWatch logs for a specific ECS task
 */
export async function getECSTaskLogs(
  taskArn: string,
  logGroupName: string,
  region: string
): Promise<string[]> {
  const client = new CloudWatchLogsClient({ region });

  // Extract task ID from ARN
  const taskId = taskArn.split('/').pop();

  const command = new FilterLogEventsCommand({
    logGroupName,
    filterPattern: taskId,
    limit: 100,
  });

  const response = await client.send(command);

  return response.events?.map(event => event.message || '') || [];
}

/**
 * Check if ECS task is running
 */
export async function isECSTaskRunning(
  clusterName: string,
  taskArn: string,
  region: string
): Promise<boolean> {
  const client = new ECSClient({ region });

  const command = new DescribeTasksCommand({
    cluster: clusterName,
    tasks: [taskArn],
  });

  const response = await client.send(command);

  if (!response.tasks || response.tasks.length === 0) {
    return false;
  }

  const task = response.tasks[0];
  return task.lastStatus === 'RUNNING';
}

/**
 * Upload a test file to S3
 */
export async function uploadTestFileToS3(
  bucketName: string,
  key: string,
  content: string,
  region: string
): Promise<void> {
  const client = new S3Client({ region });

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: content,
    ContentType: 'text/plain',
  });

  await client.send(command);
}

/**
 * Download a file from S3
 */
export async function downloadFileFromS3(
  bucketName: string,
  key: string,
  region: string
): Promise<string> {
  const client = new S3Client({ region });

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await client.send(command);

  if (!response.Body) {
    throw new Error('No body in S3 response');
  }

  return await response.Body.transformToString();
}

/**
 * Delete a file from S3
 */
export async function deleteFileFromS3(
  bucketName: string,
  key: string,
  region: string
): Promise<void> {
  const client = new S3Client({ region });

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await client.send(command);
}

/**
 * Cleanup test project and all associated data
 */
export async function cleanupProject(
  request: APIRequestContext,
  projectId: string,
  tenantId: string
): Promise<void> {
  const response = await request.delete(`/api/projects/${projectId}`, {
    headers: {
      'X-Tenant-Id': tenantId,
    },
  });

  if (!response.ok() && response.status() !== 404) {
    console.warn(`Failed to cleanup project ${projectId}: ${response.status()}`);
  }
}

/**
 * Cleanup test ticket
 */
export async function cleanupTicket(
  request: APIRequestContext,
  ticketId: string,
  tenantId: string
): Promise<void> {
  const response = await request.delete(`/api/tickets/${ticketId}`, {
    headers: {
      'X-Tenant-Id': tenantId,
    },
  });

  if (!response.ok() && response.status() !== 404) {
    console.warn(`Failed to cleanup ticket ${ticketId}: ${response.status()}`);
  }
}

/**
 * Get health status of the API
 */
export async function checkAPIHealth(apiUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * List all running ECS tasks in a cluster
 */
export async function listRunningECSTasks(
  clusterName: string,
  region: string
): Promise<string[]> {
  const client = new ECSClient({ region });

  const command = new ListTasksCommand({
    cluster: clusterName,
    desiredStatus: 'RUNNING',
  });

  const response = await client.send(command);

  return response.taskArns || [];
}
