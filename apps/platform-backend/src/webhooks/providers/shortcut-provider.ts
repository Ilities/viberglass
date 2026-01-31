/**
 * Shortcut webhook provider implementation
 *
 * Handles inbound webhook events from Shortcut (formerly Clubhouse) and 
 * outbound API calls for posting comments, updating labels, and reporting 
 * execution results.
 *
 * @see https://developer.shortcut.com/api/webhook/
 * @see https://developer.shortcut.com/rest/v3/
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
 * Shortcut webhook payload types
 */
interface ShortcutStoryPayload {
  id: string;
  object_type: 'story';
  action: 'create' | 'update' | 'delete';
  changed_fields?: string[];
  member_id: string;
  data: {
    id: number;
    name: string;
    description?: string;
    story_type: 'feature' | 'bug' | 'chore';
    workflow_state_id: number;
    workflow_state: {
      id: number;
      name: string;
    };
    project_id?: number;
    project?: {
      id: number;
      name: string;
    };
    labels?: Array<{
      id: number;
      name: string;
    }>;
    requested_by: {
      id: string;
      name: string;
    };
    owner_ids: string[];
    created_at: string;
    updated_at: string;
    external_id?: string;
    url: string;
    app_url: string;
  };
  refs?: Array<{
    id: number;
    entity_type: string;
  }>;
}

interface ShortcutCommentPayload {
  id: string;
  object_type: 'comment';
  action: 'create' | 'update' | 'delete';
  member_id: string;
  data: {
    id: number;
    story_id: number;
    text: string;
    author_id: string;
    created_at: string;
    updated_at: string;
  };
}

/**
 * Default labels for success/failure states
 */
const DEFAULT_SUCCESS_LABEL = 'fix-submitted';
const DEFAULT_FAILURE_LABEL = 'fix-failed';

/**
 * Shortcut webhook provider
 *
 * Implements WebhookProvider for Shortcut webhooks with support for:
 * - Signature verification using HMAC-SHA256
 * - Event parsing for story events
 * - Outbound API calls for comments and labels
 */
export class ShortcutWebhookProvider extends BaseWebhookProvider {
  readonly name = 'shortcut';

  constructor(config: WebhookProviderConfig) {
    super(config);
  }

  /**
   * Parse Shortcut webhook event into standardized format
   *
   * @param payload - Raw webhook payload
   * @param headers - Request headers
   * @returns Parsed webhook event
   */
  parseEvent(
    payload: unknown,
    headers: Record<string, string>
  ): ParsedWebhookEvent {
    const data = payload as Record<string, unknown>;
    const objectType = data.object_type as string | undefined;
    const action = data.action as string | undefined;

    if (!objectType) {
      throw new Error('Missing object_type in payload');
    }

    // Extract delivery ID from headers or generate one
    const deliveryId =
      (headers['x-shortcut-delivery'] as string) ||
      crypto.randomUUID();

    // Build metadata
    const metadata = this.buildMetadata(data);

    // Extract Shortcut-specific metadata
    const storyData = data.data as ShortcutStoryPayload['data'] | undefined;
    if (storyData) {
      metadata.issueKey = storyData.id.toString();
      metadata.projectId = storyData.project_id?.toString();
      metadata.repositoryId = storyData.project?.name;
    }

    // Map Shortcut event to standardized event type
    const eventType = this.mapShortcutEventType(objectType, action);

    // Extract sender info
    const memberId = data.member_id as string | undefined;
    if (memberId) {
      metadata.sender = memberId;
    }

    return {
      provider: 'shortcut',
      eventType,
      deduplicationId: deliveryId,
      timestamp: this.extractTimestamp(data),
      payload,
      metadata,
    };
  }

  /**
   * Map Shortcut event type to standardized event type
   */
  private mapShortcutEventType(
    objectType: string,
    action?: string
  ): string {
    const eventMap: Record<string, string> = {
      'story_create': 'story_created',
      'story_update': 'story_updated',
      'story_delete': 'story_deleted',
      'comment_create': 'comment_created',
      'comment_update': 'comment_updated',
      'comment_delete': 'comment_deleted',
    };

    const key = `${objectType}_${action}`;
    return eventMap[key] || key;
  }

  /**
   * Verify Shortcut webhook signature
   *
   * Shortcut uses HMAC-SHA256 with signature in X-Shortcut-Signature header.
   * Format: hex digest
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
    return [
      'story_created',
      'story_updated',
      'story_deleted',
      'comment_created',
      'comment_updated',
    ];
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

    if (!Array.isArray(config.allowedEvents) || config.allowedEvents.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Post a comment to a Shortcut story
   *
   * @param storyId - Story ID
   * @param body - Comment body (markdown)
   */
  async postComment(storyId: string, body: string): Promise<void> {
    const client = this.getHttpClient();

    await client.post('/comments', {
      story_id: parseInt(storyId, 10),
      text: body,
    });
  }

  /**
   * Update labels on a Shortcut story
   *
   * @param storyId - Story ID
   * @param add - Labels to add
   * @param remove - Labels to remove
   */
  async updateLabels(
    storyId: string,
    add: string[],
    remove: string[]
  ): Promise<void> {
    const client = this.getHttpClient();

    // First, get current story to retrieve existing labels
    const storyResponse = await client.get(`/stories/${storyId}`);
    const story = storyResponse.data;
    const currentLabels: Array<{ name: string }> = story.labels || [];
    const currentLabelNames = new Set(currentLabels.map((l) => l.name));

    // Remove labels
    for (const label of remove) {
      currentLabelNames.delete(label);
    }

    // Add labels
    for (const label of add) {
      currentLabelNames.add(label);
    }

    // Update story labels
    await client.put(`/stories/${storyId}`, {
      labels: Array.from(currentLabelNames).map((name) => ({ name })),
    });
  }

  /**
   * Post execution result to Shortcut story
   *
   * Posts a formatted comment and updates labels based on success/failure.
   *
   * @param storyId - Story ID
   * @param result - Execution result
   */
  async postResult(storyId: string, result: WebhookResult): Promise<void> {
    // Format and post comment
    const commentBody = this.formatCommentBody(result);
    await this.postComment(storyId, commentBody);

    // Update labels based on result
    const { add, remove } = this.formatLabels(result.success);
    await this.updateLabels(storyId, add, remove);
  }

  /**
   * Create HTTP client for Shortcut API calls
   *
   * @returns Configured axios instance
   */
  protected createHttpClient(): AxiosInstance {
    const apiBaseUrl = this.config.apiBaseUrl || 'https://api.app.shortcut.com/api/v3';
    const token = this.config.apiToken || '';

    return axios.create({
      baseURL: apiBaseUrl,
      headers: {
        'Shortcut-Token': token,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Get story details from Shortcut
   */
  async getStory(storyId: string): Promise<{
    id: number;
    name: string;
    description?: string;
    story_type: string;
    state: string;
    labels: string[];
    url: string;
  }> {
    const client = this.getHttpClient();
    const response = await client.get(`/stories/${storyId}`);
    const story = response.data;

    return {
      id: story.id,
      name: story.name,
      description: story.description,
      story_type: story.story_type,
      state: story.workflow_state?.name,
      labels: (story.labels || []).map((l: { name: string }) => l.name),
      url: story.app_url,
    };
  }

  /**
   * Update story workflow state
   */
  async updateStoryState(storyId: string, workflowStateId: number): Promise<void> {
    const client = this.getHttpClient();
    await client.put(`/stories/${storyId}`, {
      workflow_state_id: workflowStateId,
    });
  }

  /**
   * Add owner to story
   */
  async addOwner(storyId: string, memberId: string): Promise<void> {
    const client = this.getHttpClient();
    
    // First get current owners
    const storyResponse = await client.get(`/stories/${storyId}`);
    const currentOwners: string[] = storyResponse.data.owner_ids || [];
    
    // Add new owner if not already present
    if (!currentOwners.includes(memberId)) {
      await client.put(`/stories/${storyId}`, {
        owner_ids: [...currentOwners, memberId],
      });
    }
  }
}
