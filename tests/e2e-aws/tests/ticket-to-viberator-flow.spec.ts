import { test, expect } from '@playwright/test';
import {
  setupAWSTest,
  createTestProject,
  createTestTicket,
  triggerViberatorExecution,
  waitForJobCompletion,
  cleanupProject,
  getECSTaskLogs,
} from '../fixtures/aws-setup';

/**
 * End-to-end test: Full ticket creation → Viberator execution → Result flow
 *
 * This test validates the complete workflow on real AWS infrastructure:
 * 1. Create a project
 * 2. Create a ticket
 * 3. Trigger Viberator execution
 * 4. Wait for worker to complete
 * 5. Verify results
 */
test.describe('Ticket to Viberator Flow (AWS)', () => {
  let testContext;

  test.beforeAll(async () => {
    testContext = setupAWSTest();
  });

  test('should create ticket and execute Viberator successfully', async ({ request }) => {
    // Step 1: Create test project
    console.log('Creating test project...');
    const project = await createTestProject(request, testContext.tenantId);

    expect(project).toBeDefined();
    expect(project.id).toBeTruthy();
    expect(project.tenant_id).toBe(testContext.tenantId);

    try {
      // Step 2: Create test ticket
      console.log('Creating test ticket...');
      const ticket = await createTestTicket(
        request,
        project.id,
        testContext.tenantId,
        'E2E Test: Implement user authentication'
      );

      expect(ticket).toBeDefined();
      expect(ticket.id).toBeTruthy();
      expect(ticket.project_id).toBe(project.id);
      expect(ticket.title).toContain('E2E Test');

      // Step 3: Trigger Viberator execution
      console.log('Triggering Viberator execution...');
      const job = await triggerViberatorExecution(
        request,
        ticket.id,
        testContext.tenantId
      );

      expect(job).toBeDefined();
      expect(job.id).toBeTruthy();
      expect(job.ticket_id).toBe(ticket.id);
      expect(job.status).toBe('pending');

      // Step 4: Wait for job to complete
      console.log(`Waiting for job ${job.id} to complete...`);
      const completedJob = await waitForJobCompletion(
        request,
        job.id,
        testContext.tenantId,
        300000 // 5 minutes timeout
      );

      expect(completedJob.status).toBe('completed');

      // Step 5: Verify job results
      console.log('Verifying job results...');
      const jobResponse = await request.get(`/api/jobs/${job.id}`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      expect(jobResponse.ok()).toBeTruthy();
      const jobDetails = await jobResponse.json();

      expect(jobDetails.completed_at).toBeTruthy();
      expect(jobDetails.result).toBeDefined();

      // Step 6: If task ARN is available, fetch CloudWatch logs
      if (completedJob.task_arn) {
        console.log('Fetching CloudWatch logs...');
        const logs = await getECSTaskLogs(
          completedJob.task_arn,
          process.env.CLOUDWATCH_LOG_GROUP || '/ecs/viberglass-staging-worker',
          testContext.region
        );

        expect(logs.length).toBeGreaterThan(0);
        console.log(`Retrieved ${logs.length} log entries`);
      }

      // Step 7: Verify ticket was updated with results
      const ticketResponse = await request.get(`/api/tickets/${ticket.id}`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      expect(ticketResponse.ok()).toBeTruthy();
      const updatedTicket = await ticketResponse.json();

      expect(updatedTicket.status).toBe('completed');

    } finally {
      // Cleanup
      console.log('Cleaning up test project...');
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should handle Viberator execution timeout', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Create a ticket with a deliberately long/complex task
      const ticket = await createTestTicket(
        request,
        project.id,
        testContext.tenantId,
        'E2E Test: Implement complex distributed system'
      );

      const job = await triggerViberatorExecution(
        request,
        ticket.id,
        testContext.tenantId
      );

      // Set a short timeout to test timeout handling
      await expect(async () => {
        await waitForJobCompletion(
          request,
          job.id,
          testContext.tenantId,
          10000 // 10 seconds timeout
        );
      }).rejects.toThrow(/did not complete within/);

      // Verify job is still in progress or pending
      const jobResponse = await request.get(`/api/jobs/${job.id}`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      const jobDetails = await jobResponse.json();
      expect(['pending', 'in_progress']).toContain(jobDetails.status);

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should handle Viberator execution failure gracefully', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Create a ticket that might cause execution failure (invalid config, etc.)
      const ticket = await createTestTicket(
        request,
        project.id,
        testContext.tenantId,
        'E2E Test: Invalid task that should fail'
      );

      // Note: This test assumes we can trigger a failure condition
      // In practice, you might need to configure the ticket/project to cause a failure

      const job = await triggerViberatorExecution(
        request,
        ticket.id,
        testContext.tenantId
      );

      const completedJob = await waitForJobCompletion(
        request,
        job.id,
        testContext.tenantId
      );

      // Job should complete (either successfully or with failure status)
      expect(['completed', 'failed']).toContain(completedJob.status);

      // Verify error details are captured if failed
      if (completedJob.status === 'failed') {
        expect(completedJob.error_message).toBeTruthy();
      }

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should handle concurrent ticket executions', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Create multiple tickets
      const tickets = await Promise.all([
        createTestTicket(request, project.id, testContext.tenantId, 'E2E Test: Task 1'),
        createTestTicket(request, project.id, testContext.tenantId, 'E2E Test: Task 2'),
        createTestTicket(request, project.id, testContext.tenantId, 'E2E Test: Task 3'),
      ]);

      expect(tickets.length).toBe(3);

      // Trigger executions concurrently
      const jobs = await Promise.all(
        tickets.map(ticket =>
          triggerViberatorExecution(request, ticket.id, testContext.tenantId)
        )
      );

      expect(jobs.length).toBe(3);

      // Wait for all jobs to complete
      const completedJobs = await Promise.all(
        jobs.map(job =>
          waitForJobCompletion(request, job.id, testContext.tenantId)
        )
      );

      // All jobs should complete successfully
      completedJobs.forEach(job => {
        expect(job.status).toBe('completed');
      });

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });
});
