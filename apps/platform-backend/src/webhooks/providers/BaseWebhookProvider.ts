/**
 * Base webhook provider with common utility methods
 *
 * Extends WebhookProvider with shared functionality for parsing
 * payloads and extracting metadata.
 */

import type {
  WebhookEventMetadata,
  WebhookProviderConfig,
} from "../WebhookProvider";
import { WebhookProvider } from "../WebhookProvider";

/**
 * GitHub webhook payload structure
 */
interface GitHubWebhookPayload {
  action?: string;
  issue?: {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string };
    created_at: string;
    updated_at: string;
  };
  comment?: {
    id: number;
    user: { login: string };
    created_at: string;
    updated_at: string;
    body?: string;
  };
  repository?: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
  };
  pull_request?: {
    id: number;
    number: number;
    html_url: string;
  };
  sender?: {
    login: string;
  };
}

/**
 * Generic webhook payload with unknown structure
 */
type GenericPayload = Record<string, unknown>;

/**
 * Abstract base provider with common utility methods
 *
 * Providers can extend this to get shared functionality for
 * payload parsing and metadata extraction.
 */
export abstract class BaseWebhookProvider extends WebhookProvider {
  constructor(config: WebhookProviderConfig) {
    super(config);
  }

  /**
   * Extract repository identifier from payload
   * Works for GitHub-style payloads with repository.full_name
   *
   * @param payload - Webhook payload
   * @returns Repository identifier (e.g., 'owner/repo') or undefined
   */
  protected extractRepositoryFromPayload(
    payload: GenericPayload,
  ): string | undefined {
    const repo = (payload as GitHubWebhookPayload).repository;
    return repo?.full_name;
  }

  /**
   * Extract issue/PR number from payload
   * Works for GitHub-style payloads with issue.number or pull_request.number
   *
   * @param payload - Webhook payload
   * @returns Issue number as string or undefined
   */
  protected extractIssueNumber(payload: GenericPayload): string | undefined {
    const ghPayload = payload as GitHubWebhookPayload;

    if (ghPayload.issue?.number) {
      return ghPayload.issue.number.toString();
    }

    if (ghPayload.pull_request?.number) {
      return ghPayload.pull_request.number.toString();
    }

    // Check for generic issue_number field
    const issueNumber = payload.issue_number as number | string | undefined;
    if (issueNumber) {
      return issueNumber.toString();
    }

    return undefined;
  }

  /**
   * Extract action from payload
   *
   * @param payload - Webhook payload
   * @returns Action string or undefined
   */
  protected extractAction(payload: GenericPayload): string | undefined {
    const ghPayload = payload as GitHubWebhookPayload;

    if (ghPayload.action) {
      return ghPayload.action;
    }

    // Check for generic action field
    return payload.action as string | undefined;
  }

  /**
   * Extract sender/actor from payload
   *
   * @param payload - Webhook payload
   * @returns Sender login or undefined
   */
  protected extractSender(payload: GenericPayload): string | undefined {
    const ghPayload = payload as GitHubWebhookPayload;

    if (ghPayload.sender?.login) {
      return ghPayload.sender.login;
    }

    // Check for generic user/actor fields
    const user = payload.user as { login?: string; name?: string } | undefined;
    if (user?.login) {
      return user.login;
    }
    if (user?.name) {
      return user.name;
    }

    const actor = payload.actor as
      | { login?: string; name?: string }
      | undefined;
    if (actor?.login) {
      return actor.login;
    }
    if (actor?.name) {
      return actor.name;
    }

    return undefined;
  }

  /**
   * Extract comment ID from payload
   *
   * @param payload - Webhook payload
   * @returns Comment ID as string or undefined
   */
  protected extractCommentId(payload: GenericPayload): string | undefined {
    const ghPayload = payload as GitHubWebhookPayload;

    if (ghPayload.comment?.id) {
      return ghPayload.comment.id.toString();
    }

    // Check for generic comment field
    const comment = payload.comment as { id?: number | string } | undefined;
    if (comment?.id) {
      return comment.id.toString();
    }

    return undefined;
  }

  /**
   * Extract timestamp from payload
   *
   * @param payload - Webhook payload
   * @returns ISO timestamp string or current time
   */
  protected extractTimestamp(payload: GenericPayload): string {
    const ghPayload = payload as GitHubWebhookPayload;

    if (ghPayload.issue?.updated_at) {
      return ghPayload.issue.updated_at;
    }

    if (ghPayload.comment?.updated_at) {
      return ghPayload.comment.updated_at;
    }

    // Check for generic timestamp fields
    const timestamp =
      (payload.timestamp as string | undefined) ||
      (payload.updated_at as string | undefined) ||
      (payload.created_at as string | undefined);

    if (timestamp) {
      return timestamp;
    }

    return new Date().toISOString();
  }

  /**
   * Build metadata object from payload
   *
   * @param payload - Webhook payload
   * @returns Webhook event metadata
   */
  protected buildMetadata(payload: GenericPayload): WebhookEventMetadata {
    return {
      repositoryId: this.extractRepositoryFromPayload(payload),
      issueKey: this.extractIssueNumber(payload),
      commentId: this.extractCommentId(payload),
      action: this.extractAction(payload),
      sender: this.extractSender(payload),
    };
  }
}
