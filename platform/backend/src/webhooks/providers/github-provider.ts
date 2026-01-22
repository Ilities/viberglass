/**
 * GitHub webhook provider implementation
 *
 * Handles inbound webhook events from GitHub and outbound API calls
 * for posting comments, updating labels, and reporting execution results.
 *
 * @see https://docs.github.com/en/webhooks/webhook-events-and-payloads
 * @see https://docs.github.com/en/rest
 */

import axios, { type AxiosInstance } from 'axios';
import crypto from 'crypto';
import { BaseWebhookProvider } from './base-provider';
import type {
  ParsedWebhookEvent,
  WebhookProviderConfig,
  WebhookResult,
} from '../provider';

/**
 * GitHub webhook payload types
 */
interface GitHubIssuePayload {
  action: string;
  issue: {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string };
    created_at: string;
    updated_at: string;
    labels?: Array<{ name: string }>;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    private: boolean;
  };
  sender: {
    login: string;
    id: number;
  };
  installation?: {
    id: number;
  };
}

interface GitHubIssueCommentPayload {
  action: string;
  issue: {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string };
  };
  comment: {
    id: number;
    user: { login: string };
    created_at: string;
    updated_at: string;
    body: string;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
  };
  sender: {
    login: string;
  };
}

interface GitHubLabel {
  name: string;
  color?: string;
  description?: string;
}

/**
 * Default labels for success/failure states
 */
const DEFAULT_SUCCESS_LABEL = 'fix-submitted';
const DEFAULT_FAILURE_LABEL = 'fix-failed';

/**
 * GitHub webhook provider
 *
 * Implements WebhookProvider for GitHub webhooks with support for:
 * - Signature verification using HMAC-SHA256
 * - Event parsing for issues and issue_comment events
 * - Outbound API calls for comments and labels
 */
export class GitHubWebhookProvider extends BaseWebhookProvider {
  readonly name = 'github';

  constructor(config: WebhookProviderConfig) {
    super(config);
  }

  /**
   * Parse GitHub webhook event into standardized format
   *
   * @param payload - Raw webhook payload
   * @param headers - Request headers
   * @returns Parsed webhook event
   */
  parseEvent(
    payload: unknown,
    headers: Record<string, string>
  ): ParsedWebhookEvent {
    const eventType = headers['x-github-event'] as string;
    const deliveryId = headers['x-github-delivery'] as string;

    if (!eventType) {
      throw new Error('Missing x-github-event header');
    }

    if (!deliveryId) {
      throw new Error('Missing x-github-delivery header');
    }

    const payloadObj = payload as Record<string, unknown>;

    // Build metadata
    const metadata = this.buildMetadata(payloadObj);

    // Override with GitHub-specific metadata
    if (payloadObj.repository) {
      const repo = payloadObj.repository as { full_name?: string };
      metadata.repositoryId = repo.full_name;
    }

    if (payloadObj.issue) {
      const issue = payloadObj.issue as { number?: number };
      metadata.issueKey = issue.number?.toString();
    }

    if (payloadObj.comment) {
      const comment = payloadObj.comment as { id?: number };
      metadata.commentId = comment.id?.toString();
    }

    if (payloadObj.action) {
      metadata.action = payloadObj.action as string;
    }

    if (payloadObj.sender) {
      const sender = payloadObj.sender as { login?: string };
      metadata.sender = sender.login;
    }

    return {
      provider: 'github',
      eventType,
      deduplicationId: deliveryId,
      timestamp: this.extractTimestamp(payloadObj),
      payload,
      metadata,
    };
  }

  /**
   * Verify GitHub webhook signature
   *
   * GitHub uses HMAC-SHA256 with signature in x-hub-signature-256 header.
   * Format: sha256=<hex_digest>
   *
   * @param payload - Raw request body
   * @param signature - Signature from header
   * @param secret - Webhook secret
   * @returns True if signature is valid
   */
  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    // Strip prefix if present
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
    return ['issues', 'issue_comment', 'pull_request'];
  }

  /**
   * Validate provider configuration
   *
   * @param config - Configuration to validate
   * @returns True if valid
   */
  validateConfig(config: WebhookProviderConfig): boolean {
    if (!config.webhookSecret && config.secretLocation === 'database') {
      return false;
    }

    if (!config.apiToken) {
      return false;
    }

    if (!config.providerProjectId) {
      return false;
    }

    if (!Array.isArray(config.allowedEvents) || config.allowedEvents.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Post a comment to a GitHub issue
   *
   * @param issueNumber - Issue number
   * @param body - Comment body
   */
  async postComment(issueNumber: string, body: string): Promise<void> {
    const client = this.getHttpClient();
    const { owner, repo } = this.parseProjectId(
      this.config.providerProjectId || ''
    );

    await client.post(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      { body }
    );
  }

  /**
   * Update labels on a GitHub issue
   *
   * @param issueNumber - Issue number
   * @param add - Labels to add
   * @param remove - Labels to remove
   */
  async updateLabels(
    issueNumber: string,
    add: string[],
    remove: string[]
  ): Promise<void> {
    const client = this.getHttpClient();
    const { owner, repo } = this.parseProjectId(
      this.config.providerProjectId || ''
    );

    // First, get current labels
    const issueResponse = await client.get(
      `/repos/${owner}/${repo}/issues/${issueNumber}`
    );

    const issue = issueResponse.data as { labels: Array<{ name: string }> };
    const currentLabels = new Set(issue.labels.map((l) => l.name));

    // Remove labels in the remove list
    for (const label of remove) {
      currentLabels.delete(label);
    }

    // Add labels in the add list
    for (const label of add) {
      currentLabels.add(label);
    }

    // Update labels via API
    await client.put(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      labels: Array.from(currentLabels),
    });
  }

  /**
   * Post execution result to GitHub issue
   *
   * Posts a formatted comment and updates labels based on success/failure.
   *
   * @param issueNumber - Issue number
   * @param result - Execution result
   */
  async postResult(issueNumber: string, result: WebhookResult): Promise<void> {
    // Format and post comment
    const commentBody = this.formatCommentBody(result);
    await this.postComment(issueNumber, commentBody);

    // Update labels based on result
    const { add, remove } = this.formatLabels(result.success);
    await this.updateLabels(issueNumber, add, remove);
  }

  /**
   * Create HTTP client for GitHub API calls (implements abstract method)
   *
   * @returns Configured axios instance
   */
  protected createHttpClient(): AxiosInstance {
    const apiBaseUrl = this.config.apiBaseUrl || 'https://api.github.com';
    const token = this.config.apiToken || '';

    return axios.create({
      baseURL: apiBaseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Viberator-Webhook/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 30000, // 30 second timeout
    });
  }

  /**
   * Get repository information
   *
   * @returns Repository metadata
   */
  async getRepositoryInfo(): Promise<{
    name: string;
    full_name: string;
    private: boolean;
  }> {
    const client = this.getHttpClient();
    const { owner, repo } = this.parseProjectId(
      this.config.providerProjectId || ''
    );

    const response = await client.get(`/repos/${owner}/${repo}`);
    return response.data;
  }

  /**
   * Check if issue is in open state
   *
   * @param issueNumber - Issue number
   * @returns True if issue is open
   */
  async isIssueOpen(issueNumber: string): Promise<boolean> {
    const client = this.getHttpClient();
    const { owner, repo } = this.parseProjectId(
      this.config.providerProjectId || ''
    );

    const response = await client.get(`/repos/${owner}/${repo}/issues/${issueNumber}`);
    return response.data.state === 'open';
  }

  /**
   * Close an issue
   *
   * @param issueNumber - Issue number
   */
  async closeIssue(issueNumber: string): Promise<void> {
    const client = this.getHttpClient();
    const { owner, repo } = this.parseProjectId(
      this.config.providerProjectId || ''
    );

    await client.patch(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      state: 'closed',
    });
  }

  /**
   * Reopen an issue
   *
   * @param issueNumber - Issue number
   */
  async reopenIssue(issueNumber: string): Promise<void> {
    const client = this.getHttpClient();
    const { owner, repo } = this.parseProjectId(
      this.config.providerProjectId || ''
    );

    await client.patch(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      state: 'open',
    });
  }

  /**
   * Add assignees to an issue
   *
   * @param issueNumber - Issue number
   * @param assignees - Array of usernames to assign
   */
  async addAssignees(issueNumber: string, assignees: string[]): Promise<void> {
    const client = this.getHttpClient();
    const { owner, repo } = this.parseProjectId(
      this.config.providerProjectId || ''
    );

    await client.post(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, {
      assignees,
    });
  }

  /**
   * Create a pull request
   *
   * @param title - PR title
   * @param body - PR body
   * @param head - Branch with changes
   * @param base - Base branch (default: main)
   * @returns Created PR URL
   */
  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string = 'main'
  ): Promise<string> {
    const client = this.getHttpClient();
    const { owner, repo } = this.parseProjectId(
      this.config.providerProjectId || ''
    );

    const response = await client.post(`/repos/${owner}/${repo}/pulls`, {
      title,
      body,
      head,
      base,
    });

    return response.data.html_url;
  }
}
