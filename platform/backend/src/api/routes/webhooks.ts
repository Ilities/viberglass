import express from 'express';
import crypto from 'crypto';
import { GitHubIntegration } from '../../integrations/GitHubIntegration';
import { BugReportDAO } from '../../persistence/BugReportDAO';
import { MessageQueueService } from '../../services/MessageQueueService';
import { pool } from '../../persistence/config/database';

const router = express.Router();
const bugReportService = new BugReportDAO();
const messageQueueService = new MessageQueueService();

// Middleware to verify GitHub webhook signature
const verifyGitHubSignature = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const payload = JSON.stringify(req.body);
  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';

  if (!signature || !secret) {
    return res.status(401).json({ error: 'Unauthorized: Missing signature or secret' });
  }

  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex')}`;

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
  }

  next();
};

// GitHub webhook endpoint
router.post('/github', verifyGitHubSignature, async (req, res) => {
  try {
    const event = req.headers['x-github-event'] as string;
    const payload = req.body;

    // Only process issue events
    if (event !== 'issues' && event !== 'issue_comment') {
      return res.status(200).json({ message: 'Event ignored' });
    }

    // Store webhook event for audit
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO webhook_events (project_id, event_type, ticket_id, payload, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          payload.repository?.id || 'unknown',
          event,
          payload.issue?.number?.toString() || 'unknown',
          JSON.stringify(payload),
          new Date()
        ]
      );
    } finally {
      client.release();
    }

    // Create GitHub integration instance (would normally get credentials from database)
    const githubConfig = {
      type: 'token' as const,
      token: process.env.GITHUB_TOKEN || '',
      owner: payload.repository.owner.login,
      repo: payload.repository.name
    };

    const githubIntegration = new GitHubIntegration(githubConfig);
    const webhookEvent = githubIntegration.handleWebhook(payload);

    // Check if this issue has auto-fix tags and queue for processing
    if (githubIntegration.hasAutoFixTag(webhookEvent.ticket)) {
      console.log(`Auto-fix detected for issue ${webhookEvent.ticketId}`);
      
      // Queue auto-fix job
      await messageQueueService.queueAutoFixJob({
        ticketId: webhookEvent.ticketId,
        ticketSystem: 'github',
        repositoryUrl: webhookEvent.ticket.repositoryUrl || '',
        issueData: webhookEvent.ticket,
        priority: webhookEvent.ticket.priority || 'medium'
      });

      // Update database with auto-fix status
      const client2 = await pool.connect();
      try {
        await client2.query(
          `INSERT INTO auto_fix_queue (ticket_id, status, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (ticket_id) DO UPDATE SET 
           status = EXCLUDED.status,
           created_at = EXCLUDED.created_at`,
          [webhookEvent.ticketId, 'pending', new Date()]
        );
      } finally {
        client2.release();
      }
    }

    res.status(200).json({ 
      message: 'Webhook processed successfully',
      eventType: webhookEvent.type,
      autoFixQueued: githubIntegration.hasAutoFixTag(webhookEvent.ticket)
    });

  } catch (error) {
    console.error('Error processing GitHub webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Linear webhook endpoint
router.post('/linear', async (req, res) => {
  try {
    const payload = req.body;
    const event = payload.type;

    if (!event || !payload.data) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Store webhook event for audit
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO webhook_events (project_id, event_type, ticket_id, payload, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          payload.data.team?.id || 'unknown',
          event,
          payload.data.id || 'unknown',
          JSON.stringify(payload),
          new Date()
        ]
      );
    } finally {
      client.release();
    }

    // Process Linear webhook (would implement LinearIntegration similarly)
    console.log(`Linear webhook received: ${event}`);

    res.status(200).json({ message: 'Linear webhook processed successfully' });

  } catch (error) {
    console.error('Error processing Linear webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Jira webhook endpoint
router.post('/jira', async (req, res) => {
  try {
    const payload = req.body;
    const event = payload.webhookEvent;

    if (!event || !payload.issue) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Store webhook event for audit
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO webhook_events (project_id, event_type, ticket_id, payload, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          payload.issue.fields?.project?.id || 'unknown',
          event,
          payload.issue.key || 'unknown',
          JSON.stringify(payload),
          new Date()
        ]
      );
    } finally {
      client.release();
    }

    // Process Jira webhook (would implement JiraIntegration similarly)
    console.log(`Jira webhook received: ${event}`);

    res.status(200).json({ message: 'Jira webhook processed successfully' });

  } catch (error) {
    console.error('Error processing Jira webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Generic webhook status endpoint
router.get('/status', async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          event_type,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE processed = true) as processed_count,
          COUNT(*) FILTER (WHERE processed = false) as pending_count
        FROM webhook_events 
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY event_type
        ORDER BY count DESC
      `);

      const autoFixResult = await client.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM auto_fix_queue
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY status
      `);

      res.json({
        webhooks: result.rows,
        autoFixQueue: autoFixResult.rows
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting webhook status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Endpoint to manually trigger auto-fix for a ticket
router.post('/trigger-autofix', async (req, res) => {
  try {
    const { ticketId, ticketSystem, repositoryUrl } = req.body;

    if (!ticketId || !ticketSystem) {
      return res.status(400).json({ error: 'ticketId and ticketSystem are required' });
    }

    // Queue auto-fix job
    await messageQueueService.queueAutoFixJob({
      ticketId,
      ticketSystem,
      repositoryUrl: repositoryUrl || '',
      priority: 'medium'
    });

    // Update database
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO auto_fix_queue (ticket_id, status, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (ticket_id) DO UPDATE SET 
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at`,
        [ticketId, 'pending', new Date()]
      );
    } finally {
      client.release();
    }

    res.json({ 
      message: 'Auto-fix job queued successfully',
      ticketId,
      ticketSystem
    });

  } catch (error) {
    console.error('Error triggering auto-fix:', error);
    res.status(500).json({ error: 'Failed to trigger auto-fix' });
  }
});

export default router;