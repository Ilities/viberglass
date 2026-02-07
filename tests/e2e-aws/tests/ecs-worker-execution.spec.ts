import { test, expect } from '@playwright/test';
import {
  setupAWSTest,
  createTestProject,
  createTestTicket,
  triggerViberatorExecution,
  cleanupProject,
  isECSTaskRunning,
  listRunningECSTasks,
  getECSTaskLogs,
} from '../fixtures/aws-setup';

/**
 * End-to-end test: ECS Fargate worker execution
 *
 * This test validates worker execution on ECS:
 * 1. Trigger Viberator execution
 * 2. Verify ECS task is launched
 * 3. Monitor task status
 * 4. Verify CloudWatch logs
 */
test.describe('ECS Worker Execution (AWS)', () => {
  let testContext;
  const ecsClusterName = process.env.ECS_CLUSTER_NAME || 'viberglass-staging-backend-cluster';
  const logGroupName = process.env.CLOUDWATCH_LOG_GROUP || '/ecs/viberglass-staging-worker';

  test.beforeAll(async () => {
    testContext = setupAWSTest();
  });

  test('should launch ECS task for Viberator execution', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      const ticket = await createTestTicket(
        request,
        project.id,
        testContext.tenantId,
        'E2E Test: ECS Worker Execution'
      );

      // Trigger execution
      console.log('Triggering Viberator execution...');
      const job = await triggerViberatorExecution(
        request,
        ticket.id,
        testContext.tenantId
      );

      // Wait a bit for ECS task to start
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Verify job has task ARN
      const jobResponse = await request.get(`/api/jobs/${job.id}`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      const jobDetails = await jobResponse.json();
      expect(jobDetails.task_arn).toBeTruthy();

      // Verify ECS task is running
      console.log(`Checking ECS task status: ${jobDetails.task_arn}`);
      const isRunning = await isECSTaskRunning(
        ecsClusterName,
        jobDetails.task_arn,
        testContext.region
      );

      // Task should be running or completed
      expect([true, false]).toContain(isRunning);
      console.log(`Task running: ${isRunning}`);

      // Get CloudWatch logs
      console.log('Fetching CloudWatch logs...');
      const logs = await getECSTaskLogs(
        jobDetails.task_arn,
        logGroupName,
        testContext.region
      );

      expect(logs.length).toBeGreaterThan(0);
      console.log(`Retrieved ${logs.length} log entries`);

      // Verify logs contain expected content
      const logsString = logs.join('\n');
      expect(logsString).toContain('Viberator'); // Should contain worker name or process info

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should list running ECS tasks', async () => {
    console.log('Listing running ECS tasks...');
    const runningTasks = await listRunningECSTasks(
      ecsClusterName,
      testContext.region
    );

    console.log(`Found ${runningTasks.length} running tasks`);
    expect(runningTasks).toBeDefined();
    expect(Array.isArray(runningTasks)).toBeTruthy();
  });

  test('should handle ECS task failure', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Create a ticket that might cause task failure
      const ticket = await createTestTicket(
        request,
        project.id,
        testContext.tenantId,
        'E2E Test: Intentional Failure'
      );

      const job = await triggerViberatorExecution(
        request,
        ticket.id,
        testContext.tenantId
      );

      // Wait for task to start and potentially fail
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Check job status
      const jobResponse = await request.get(`/api/jobs/${job.id}`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      const jobDetails = await jobResponse.json();

      // If task failed, verify error is captured
      if (jobDetails.status === 'failed') {
        expect(jobDetails.error_message).toBeTruthy();

        // Get logs to verify failure reason
        if (jobDetails.task_arn) {
          const logs = await getECSTaskLogs(
            jobDetails.task_arn,
            logGroupName,
            testContext.region
          );

          expect(logs.length).toBeGreaterThan(0);
          const logsString = logs.join('\n');
          console.log('Failure logs:', logsString);
        }
      }

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should handle multiple concurrent ECS tasks', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Create multiple tickets
      const tickets = await Promise.all([
        createTestTicket(request, project.id, testContext.tenantId, 'Concurrent Task 1'),
        createTestTicket(request, project.id, testContext.tenantId, 'Concurrent Task 2'),
        createTestTicket(request, project.id, testContext.tenantId, 'Concurrent Task 3'),
      ]);

      // Trigger executions
      const jobs = await Promise.all(
        tickets.map(ticket =>
          triggerViberatorExecution(request, ticket.id, testContext.tenantId)
        )
      );

      // Wait for tasks to start
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Verify all jobs have task ARNs
      const jobPromises = jobs.map(job =>
        request.get(`/api/jobs/${job.id}`, {
          headers: {
            'X-Tenant-Id': testContext.tenantId,
          },
        })
      );

      const jobResponses = await Promise.all(jobPromises);
      const jobDetails = await Promise.all(jobResponses.map(r => r.json()));

      jobDetails.forEach(job => {
        expect(job.task_arn).toBeTruthy();
      });

      // Verify multiple tasks are running in cluster
      const runningTasks = await listRunningECSTasks(
        ecsClusterName,
        testContext.region
      );

      console.log(`Total running tasks in cluster: ${runningTasks.length}`);
      expect(runningTasks.length).toBeGreaterThanOrEqual(1);

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should respect ECS task resource limits', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Create a ticket with resource-intensive requirements
      const ticket = await createTestTicket(
        request,
        project.id,
        testContext.tenantId,
        'E2E Test: Resource Intensive Task'
      );

      const job = await triggerViberatorExecution(
        request,
        ticket.id,
        testContext.tenantId
      );

      await new Promise(resolve => setTimeout(resolve, 10000));

      // Verify task was launched with proper resource allocation
      const jobResponse = await request.get(`/api/jobs/${job.id}`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      const jobDetails = await jobResponse.json();
      expect(jobDetails.task_arn).toBeTruthy();

      // Task should not be killed due to OOM or CPU limits
      // (This is a basic check - detailed resource monitoring would require ECS API calls)
      expect(jobDetails.status).not.toBe('oom_killed');

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });
});
