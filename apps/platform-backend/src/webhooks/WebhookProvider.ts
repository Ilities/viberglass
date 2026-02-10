/**
 * Base webhook provider interfaces and types
 *
 * Defines the contract for webhook providers supporting both
 * inbound event processing and outbound result posting.
 */

import type { AxiosInstance } from 'axios';

/**
 * Supported provider types
 */
export type ProviderType = 'github' | 'jira' | 'shortcut' | 'custom';

/**
 * Hash algorithm for signature verification
 */
export type HashAlgorithm = 'sha256' | 'sha1';

/**
 * Secret storage location
 */
export type SecretLocation = 'database' | 'ssm' | 'env';

/**
 * Configuration for a webhook provider
 */
export interface WebhookProviderConfig {
  /** Provider type identifier */
  type: ProviderType;
  /** Where to fetch the webhook secret from */
  secretLocation: SecretLocation;
  /** Path for SSM or database lookup */
  secretPath?: string;
  /** Hash algorithm for signature verification */
  algorithm: HashAlgorithm;
  /** Event types this provider should handle */
  allowedEvents: string[];
  /** Webhook secret for database storage */
  webhookSecret?: string;
  /** API token for outbound calls (posting results) */
  apiToken?: string;
  /** Provider-specific project identifier (e.g., 'owner/repo' for GitHub) */
  providerProjectId?: string;
  /** Optional GitHub/GitLab API base URL for self-hosted instances */
  apiBaseUrl?: string;
  /** Provider-specific behavior overrides (labels, transitions, etc.) */
  labelMappings?: Record<string, unknown>;
}

/**
 * Metadata extracted from webhook payload
 */
export interface WebhookEventMetadata {
  /** Project identifier from source system */
  projectId?: string;
  /** Repository identifier (GitHub) or equivalent */
  repositoryId?: string;
  /** Issue/PR/ticket key number */
  issueKey?: string;
  /** Comment ID for comment events */
  commentId?: string;
  /** Action performed (opened, edited, closed, etc.) */
  action?: string;
  /** Sender/actor who triggered the event */
  sender?: string;
}

/**
 * Standardized parsed webhook event
 */
export interface ParsedWebhookEvent {
  /** Provider name (github, jira, etc.) */
  provider: string;
  /** Event type from provider (issues, issue_comment, etc.) */
  eventType: string;
  /** Unique ID for deduplication (delivery ID from provider) */
  deduplicationId: string;
  /** ISO timestamp of the event */
  timestamp: string;
  /** Raw payload from provider */
  payload: unknown;
  /** Extracted metadata for routing and processing */
  metadata: WebhookEventMetadata;
}

/**
 * Result of an outbound webhook operation
 */
export interface WebhookResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Type of action performed */
  action: 'comment' | 'label_update' | 'status_update';
  /** Target identifier (issue number, ticket key, etc.) */
  targetId: string;
  /** Human-readable details */
  details?: string;
  /** Commit hash if code was committed */
  commitHash?: string;
  /** Pull request URL if PR was created */
  pullRequestUrl?: string;
  /** Error message if operation failed */
  errorMessage?: string;
}

/**
 * Options for posting a comment
 */
export interface PostCommentOptions {
  /** Comment body in markdown */
  body: string;
  /** Whether to include timestamp */
  includeTimestamp?: boolean;
}

/**
 * Options for updating labels
 */
export interface UpdateLabelsOptions {
  /** Labels to add */
  add: string[];
  /** Labels to remove */
  remove: string[];
}

/**
 * Abstract base class for webhook providers
 *
 * Providers must implement both inbound operations (parsing events,
 * verifying signatures) and outbound operations (posting results back
 * to the source platform).
 */
export abstract class WebhookProvider {
  /** Configured provider instance */
  protected config: WebhookProviderConfig;

  /** HTTP client for outbound API calls */
  protected httpClient?: AxiosInstance;

  constructor(config: WebhookProviderConfig) {
    this.config = config;
  }

  /** Provider name identifier */
  abstract readonly name: string;

  /**
   * Parse incoming webhook payload into standardized format
   * @param payload - Raw webhook payload
   * @param headers - HTTP headers from webhook request
   * @returns Parsed event with metadata
   */
  abstract parseEvent(
    payload: unknown,
    headers: Record<string, string>
  ): ParsedWebhookEvent;

  /**
   * Verify webhook signature for security
   * @param payload - Raw request body as buffer
   * @param signature - Signature from header
   * @param secret - Webhook secret
   * @returns True if signature is valid
   */
  abstract verifySignature(
    payload: Buffer,
    signature: string,
    secret: string
  ): boolean;

  /**
   * Get list of event types this provider supports
   * @returns Array of event type names
   */
  abstract getSupportedEvents(): string[];

  /**
   * Validate provider configuration
   * @param config - Configuration to validate
   * @returns True if configuration is valid
   */
  abstract validateConfig(config: WebhookProviderConfig): boolean;

  // ========== OUTBOUND METHODS ==========

  /**
   * Post a comment to an issue/ticket
   * @param issueNumber - Issue/ticket identifier
   * @param body - Comment content
   */
  abstract postComment(issueNumber: string, body: string): Promise<void>;

  /**
   * Update labels on an issue/ticket
   * @param issueNumber - Issue/ticket identifier
   * @param add - Labels to add
   * @param remove - Labels to remove
   */
  abstract updateLabels(
    issueNumber: string,
    add: string[],
    remove: string[]
  ): Promise<void>;

  /**
   * Post execution result as a formatted comment with label updates
   * @param issueNumber - Issue/ticket identifier
   * @param result - Execution result to post
   */
  abstract postResult(issueNumber: string, result: WebhookResult): Promise<void>;

  /**
   * Get HTTP client for outbound API calls
   * Lazy-initialized with proper auth headers
   */
  protected getHttpClient(): AxiosInstance {
    if (!this.httpClient) {
      this.httpClient = this.createHttpClient();
    }
    return this.httpClient;
  }

  /**
   * Create HTTP client with provider-specific auth
   * Override in provider implementations
   */
  protected abstract createHttpClient(): AxiosInstance;
}
