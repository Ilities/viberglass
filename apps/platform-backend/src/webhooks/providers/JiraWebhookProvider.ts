/**
 * Jira webhook provider implementation
 *
 * Handles inbound webhook events from Jira.
 *
 * @see https://developer.atlassian.com/cloud/jira/platform/webhooks/
 */

import crypto from 'crypto';
import { isObjectRecord } from '@viberglass/types';
import { BaseWebhookProvider } from './BaseWebhookProvider';
import type {
  ParsedWebhookEvent,
  WebhookProviderConfig,
} from '../WebhookProvider';

/**
 * Jira webhook payload types
 */
interface JiraIssuePayload {
  timestamp: number;
  webhookEvent: string;
  issue_event_type_name?: string;
  user: {
    self: string;
    accountId: string;
    displayName: string;
    emailAddress?: string;
  };
  issue: {
    id: string;
    self: string;
    key: string;
    fields: {
      summary: string;
      description?: string | {
        type: string;
        version: number;
        content: unknown[];
      };
      issuetype: {
        id: string;
        name: string;
      };
      project?: {
        id?: string | number;
        key?: string;
      };
      priority?: {
        id: string;
        name: string;
      };
      status: {
        id: string;
        name: string;
      };
      labels?: string[];
      assignee?: {
        accountId: string;
        displayName: string;
      };
      reporter: {
        accountId: string;
        displayName: string;
      };
      created: string;
      updated: string;
    };
  };
  changelog?: {
    id: string;
    items: Array<{
      field: string;
      fieldtype: string;
      from: string | null;
      fromString: string | null;
      to: string | null;
      toString: string | null;
    }>;
  };
}

interface JiraCommentPayload {
  timestamp: number;
  webhookEvent: string;
  user: {
    self: string;
    accountId: string;
    displayName: string;
  };
  issue: {
    id: string;
    self: string;
    key: string;
    fields: {
      summary: string;
      issuetype: {
        name: string;
      };
    };
  };
  comment: {
    id: string;
    self: string;
    author: {
      accountId: string;
      displayName: string;
    };
    body: string | {
      type: string;
      version: number;
      content: unknown[];
    };
    created: string;
    updated: string;
  };
}

/**
 * Jira webhook provider
 *
 * Implements WebhookProvider for Jira webhooks with support for:
 * - Signature verification using JWT or HMAC-SHA256
 * - Event parsing for issue events
 */
export class JiraWebhookProvider extends BaseWebhookProvider {
  readonly name = 'jira';

  constructor(config: WebhookProviderConfig) {
    super(config);
  }

  /**
   * Parse Jira webhook event into standardized format
   *
   * @param payload - Raw webhook payload
   * @param headers - Request headers
   * @returns Parsed webhook event
   */
  parseEvent(
    payload: unknown,
    headers: Record<string, string>
  ): ParsedWebhookEvent {
    if (!isObjectRecord(payload)) {
      throw new Error('Jira payload must be a JSON object');
    }

    const data = payload;
    const webhookEvent = data.webhookEvent as string | undefined;

    if (!webhookEvent) {
      throw new Error('Missing webhookEvent in payload');
    }

    const issue = data.issue as JiraIssuePayload['issue'] | undefined;
    const comment = data.comment as JiraCommentPayload['comment'] | undefined;
    const action = this.normalizeJiraAction(data.issue_event_type_name);
    const eventType = this.mapJiraEventType(webhookEvent, action, comment);

    this.validatePayloadForSupportedEvent(eventType, issue, comment);

    // Extract delivery ID from headers or generate one
    const deliveryId =
      (headers['x-atlassian-webhook-identifier'] as string) ||
      (headers['x-request-id'] as string) ||
      crypto.randomUUID();

    // Build metadata based on event type
    const metadata = this.buildMetadata(data);

    // Extract Jira-specific metadata
    const issueKey = issue?.key;
    if (issue) {
      metadata.issueKey = issueKey;
      const projectKey = this.extractProjectKey(issue, issueKey);
      const projectId = this.extractProjectId(issue);

      if (projectKey) {
        metadata.repositoryId = projectKey;
      }
      if (projectId || projectKey) {
        metadata.projectId = projectId || projectKey;
      }

      const reporterName = issue.fields.reporter?.displayName;
      if (reporterName) {
        metadata.sender = reporterName;
      }
    }

    // Extract comment ID for comment events
    if (comment) {
      metadata.commentId = comment.id;
      const commentAuthor = comment.author?.displayName;
      if (commentAuthor) {
        metadata.sender = commentAuthor;
      }
    }

    if (action) {
      metadata.action = action;
    }

    return {
      provider: 'jira',
      eventType,
      deduplicationId: deliveryId,
      timestamp: this.extractJiraTimestamp(data),
      payload,
      metadata,
    };
  }

  /**
   * Map Jira webhook event type to standardized event type
   */
  private mapJiraEventType(
    jiraEvent: string,
    action: string | undefined,
    comment: JiraCommentPayload['comment'] | undefined,
  ): string {
    // Jira events follow pattern: jira:issue_created, jira:issue_updated, etc.
    const eventMap: Record<string, string> = {
      'jira:issue_created': 'issue_created',
      'jira:issue_updated': 'issue_updated',
      'jira:issue_deleted': 'issue_deleted',
      'jira:worklog_updated': 'worklog_updated',
      'jira:issue_comment_created': 'comment_created',
      'jira:issue_comment_updated': 'comment_updated',
      'jira:issue_comment_deleted': 'comment_deleted',
      'comment_created': 'comment_created',
      'comment_updated': 'comment_updated',
      'comment_deleted': 'comment_deleted',
    };

    if (jiraEvent === 'jira:issue_updated' && action === 'issue_commented' && comment) {
      return 'comment_created';
    }

    return eventMap[jiraEvent] || jiraEvent;
  }

  private validatePayloadForSupportedEvent(
    eventType: string,
    issue: JiraIssuePayload['issue'] | undefined,
    comment: JiraCommentPayload['comment'] | undefined,
  ): void {
    const requiresIssue = [
      'issue_created',
      'issue_updated',
      'issue_deleted',
      'comment_created',
      'comment_updated',
      'comment_deleted',
    ].includes(eventType);

    if (requiresIssue && !issue?.key) {
      throw new Error("Missing required field 'issue.key'");
    }

    if (
      requiresIssue &&
      !this.extractProjectKey(issue, issue?.key) &&
      !this.extractProjectId(issue)
    ) {
      throw new Error("Missing required field 'issue.fields.project.key'");
    }

    if (eventType === 'issue_created' && !issue?.fields?.summary) {
      throw new Error("Missing required field 'issue.fields.summary'");
    }

    const isCommentEvent = eventType.startsWith('comment_');
    if (isCommentEvent && !comment?.id) {
      throw new Error("Missing required field 'comment.id'");
    }

    if (isCommentEvent && !comment?.author?.displayName) {
      throw new Error("Missing required field 'comment.author.displayName'");
    }
  }

  private extractProjectKey(
    issue: JiraIssuePayload['issue'] | undefined,
    issueKey?: string,
  ): string | undefined {
    const projectKey = issue?.fields?.project?.key;
    if (projectKey) {
      return projectKey;
    }

    if (issueKey && issueKey.includes('-')) {
      return issueKey.split('-')[0];
    }

    return undefined;
  }

  private extractProjectId(issue: JiraIssuePayload['issue'] | undefined): string | undefined {
    const projectId = issue?.fields?.project?.id;
    if (typeof projectId === 'number') {
      return projectId.toString();
    }

    if (typeof projectId === 'string' && projectId.length > 0) {
      return projectId;
    }

    return undefined;
  }

  private normalizeJiraAction(action: unknown): string | undefined {
    if (typeof action !== 'string') {
      return undefined;
    }

    const normalized = action.trim().toLowerCase();
    return normalized || undefined;
  }

  private extractJiraTimestamp(payload: Record<string, unknown>): string {
    const rawTimestamp = payload.timestamp;
    if (typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp)) {
      return new Date(rawTimestamp).toISOString();
    }
    if (typeof rawTimestamp === 'string') {
      const asNumber = Number(rawTimestamp);
      if (Number.isFinite(asNumber)) {
        return new Date(asNumber).toISOString();
      }
      return rawTimestamp;
    }

    return this.extractTimestamp(payload);
  }

  /**
   * Verify Jira webhook signature
   *
   * Jira Cloud webhooks can use JWT verification or HMAC-SHA256.
   * This implementation supports HMAC-SHA256.
   *
   * @param payload - Raw request body
   * @param signature - Signature from header
   * @param secret - Webhook secret
   * @returns True if signature is valid
   */
  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    // Jira may send signature with or without prefix
    const receivedSignature = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;

    // Validate hex format
    if (!/^[0-9a-fA-F]{64}$/.test(receivedSignature)) {
      return false;
    }

    // Compute expected signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    // Use timing-safe comparison
    const receivedBuf = Buffer.from(receivedSignature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');

    if (receivedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuf, expectedBuf);
  }

  /**
   * Get supported event types
   *
   * @returns Array of event types this provider handles
   */
  getSupportedEvents(): string[] {
    return [
      'issue_created',
      'issue_updated',
      'issue_deleted',
      'comment_created',
      'comment_updated',
    ];
  }
}
