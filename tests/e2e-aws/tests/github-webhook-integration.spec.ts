import { test, expect } from '@playwright/test';
import {
  setupAWSTest,
  createTestProject,
  waitForJobCompletion,
  cleanupProject,
} from '../fixtures/aws-setup';
import crypto from 'crypto';

/**
 * End-to-end test: GitHub webhook → Ticket creation → Viberator execution
 *
 * This test validates webhook integration with real GitHub:
 * 1. Simulate GitHub webhook event (issue created/labeled)
 * 2. Verify ticket is created automatically
 * 3. Verify Viberator execution is triggered
 * 4. Verify results are posted back to GitHub
 */
test.describe('GitHub Webhook Integration (AWS)', () => {
  let testContext;

  test.beforeAll(async () => {
    testContext = setupAWSTest();

    // Skip tests if GitHub integration not configured
    if (!process.env.GITHUB_TEST_REPO || !process.env.GITHUB_WEBHOOK_SECRET) {
      test.skip();
    }
  });

  /**
   * Generate GitHub webhook signature for request verification
   */
  function generateWebhookSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  test('should process GitHub issue webhook and create ticket', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Step 1: Create GitHub integration for project
      console.log('Setting up GitHub integration...');
      const integrationResponse = await request.post('/api/integrations', {
        data: {
          project_id: project.id,
          type: 'github',
          configuration: {
            repository: process.env.GITHUB_TEST_REPO,
            token: process.env.GITHUB_TOKEN,
            webhook_secret: process.env.GITHUB_WEBHOOK_SECRET,
          },
        },
        headers: {
          'X-Tenant-Id': testContext.tenantId,
          'Content-Type': 'application/json',
        },
      });

      expect(integrationResponse.ok()).toBeTruthy();
      const integration = await integrationResponse.json();

      // Step 2: Simulate GitHub webhook (issue created with 'viberator' label)
      console.log('Simulating GitHub webhook...');
      const webhookPayload = {
        action: 'labeled',
        issue: {
          number: 999,
          title: 'E2E Test: Bug in authentication flow',
          body: 'Users are unable to login after password reset',
          html_url: `https://github.com/${process.env.GITHUB_TEST_REPO}/issues/999`,
          state: 'open',
          labels: [
            { name: 'viberator' },
            { name: 'bug' },
          ],
        },
        repository: {
          full_name: process.env.GITHUB_TEST_REPO,
          html_url: `https://github.com/${process.env.GITHUB_TEST_REPO}`,
        },
        label: {
          name: 'viberator',
        },
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = generateWebhookSignature(
        payloadString,
        process.env.GITHUB_WEBHOOK_SECRET!
      );

      const webhookResponse = await request.post('/api/webhooks/github', {
        data: webhookPayload,
        headers: {
          'X-Hub-Signature-256': signature,
          'X-GitHub-Event': 'issues',
          'X-GitHub-Delivery': crypto.randomUUID(),
          'Content-Type': 'application/json',
        },
      });

      expect(webhookResponse.ok()).toBeTruthy();

      // Step 3: Wait a bit for webhook processing
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Step 4: Verify ticket was created
      console.log('Verifying ticket creation...');
      const ticketsResponse = await request.get(`/api/projects/${project.id}/tickets`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      expect(ticketsResponse.ok()).toBeTruthy();
      const tickets = await ticketsResponse.json();

      expect(tickets.length).toBeGreaterThan(0);

      const createdTicket = tickets.find((t: any) =>
        t.title.includes('Bug in authentication flow')
      );

      expect(createdTicket).toBeDefined();
      expect(createdTicket.external_id).toBe('github-999');
      expect(createdTicket.external_url).toBeTruthy();

      // Step 5: Verify Viberator execution was triggered
      console.log('Verifying Viberator execution...');
      const jobsResponse = await request.get(`/api/tickets/${createdTicket.id}/jobs`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      expect(jobsResponse.ok()).toBeTruthy();
      const jobs = await jobsResponse.json();

      expect(jobs.length).toBeGreaterThan(0);
      const job = jobs[0];

      // Step 6: Wait for job completion
      console.log('Waiting for job completion...');
      const completedJob = await waitForJobCompletion(
        request,
        job.id,
        testContext.tenantId
      );

      expect(completedJob.status).toBe('completed');

      // Step 7: Verify results would be posted back to GitHub
      // (In real test, you'd verify GitHub comment was created)
      const updatedTicketResponse = await request.get(
        `/api/tickets/${createdTicket.id}`,
        {
          headers: {
            'X-Tenant-Id': testContext.tenantId,
          },
        }
      );

      const updatedTicket = await updatedTicketResponse.json();
      expect(updatedTicket.status).toBe('completed');

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should reject webhook with invalid signature', async ({ request }) => {
    const webhookPayload = {
      action: 'labeled',
      issue: {
        number: 1000,
        title: 'Test Issue',
      },
    };

    const webhookResponse = await request.post('/api/webhooks/github', {
      data: webhookPayload,
      headers: {
        'X-Hub-Signature-256': 'sha256=invalid_signature',
        'X-GitHub-Event': 'issues',
        'Content-Type': 'application/json',
      },
    });

    expect(webhookResponse.status()).toBe(401);
  });

  test('should ignore webhook for non-viberator labeled issues', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Create GitHub integration
      await request.post('/api/integrations', {
        data: {
          project_id: project.id,
          type: 'github',
          configuration: {
            repository: process.env.GITHUB_TEST_REPO,
            token: process.env.GITHUB_TOKEN,
            webhook_secret: process.env.GITHUB_WEBHOOK_SECRET,
          },
        },
        headers: {
          'X-Tenant-Id': testContext.tenantId,
          'Content-Type': 'application/json',
        },
      });

      // Send webhook WITHOUT 'viberator' label
      const webhookPayload = {
        action: 'labeled',
        issue: {
          number: 1001,
          title: 'Regular issue without viberator label',
          labels: [
            { name: 'bug' },
          ],
        },
        repository: {
          full_name: process.env.GITHUB_TEST_REPO,
        },
        label: {
          name: 'bug',
        },
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = generateWebhookSignature(
        payloadString,
        process.env.GITHUB_WEBHOOK_SECRET!
      );

      const webhookResponse = await request.post('/api/webhooks/github', {
        data: webhookPayload,
        headers: {
          'X-Hub-Signature-256': signature,
          'X-GitHub-Event': 'issues',
          'Content-Type': 'application/json',
        },
      });

      // Webhook should be accepted but no ticket created
      expect(webhookResponse.ok()).toBeTruthy();

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify no ticket was created
      const ticketsResponse = await request.get(`/api/projects/${project.id}/tickets`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      const tickets = await ticketsResponse.json();
      const createdTicket = tickets.find((t: any) =>
        t.title.includes('Regular issue without viberator label')
      );

      expect(createdTicket).toBeUndefined();

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should handle webhook rate limiting', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Create GitHub integration
      await request.post('/api/integrations', {
        data: {
          project_id: project.id,
          type: 'github',
          configuration: {
            repository: process.env.GITHUB_TEST_REPO,
            webhook_secret: process.env.GITHUB_WEBHOOK_SECRET,
          },
        },
        headers: {
          'X-Tenant-Id': testContext.tenantId,
          'Content-Type': 'application/json',
        },
      });

      // Send many webhooks rapidly
      const promises = [];
      for (let i = 0; i < 50; i++) {
        const webhookPayload = {
          action: 'labeled',
          issue: {
            number: 2000 + i,
            title: `Rate limit test issue ${i}`,
            labels: [{ name: 'viberator' }],
          },
          repository: {
            full_name: process.env.GITHUB_TEST_REPO,
          },
          label: {
            name: 'viberator',
          },
        };

        const payloadString = JSON.stringify(webhookPayload);
        const signature = generateWebhookSignature(
          payloadString,
          process.env.GITHUB_WEBHOOK_SECRET!
        );

        promises.push(
          request.post('/api/webhooks/github', {
            data: webhookPayload,
            headers: {
              'X-Hub-Signature-256': signature,
              'X-GitHub-Event': 'issues',
              'Content-Type': 'application/json',
            },
          })
        );
      }

      const responses = await Promise.all(promises);

      // Some requests should be rate limited (429)
      const rateLimitedCount = responses.filter(r => r.status() === 429).length;

      expect(rateLimitedCount).toBeGreaterThan(0);
      console.log(`${rateLimitedCount} out of 50 requests were rate limited`);

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });
});
