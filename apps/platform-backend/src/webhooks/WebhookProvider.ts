/**
 * Base webhook provider interfaces and types
 *
 * Defines the contract for webhook providers: parsing inbound events and
 * verifying their signatures.
 */

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
 * Abstract base class for webhook providers
 *
 * Providers parse inbound events and verify their signatures.
 */
export abstract class WebhookProvider {
  /** Configured provider instance */
  protected config: WebhookProviderConfig;

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
}
