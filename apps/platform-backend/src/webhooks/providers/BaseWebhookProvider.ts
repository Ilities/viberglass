/**
 * Base webhook provider with common utility methods
 *
 * Extends WebhookProvider with shared functionality for parsing
 * payloads, extracting metadata, and formatting outbound messages.
 */

import type {
  ParsedWebhookEvent,
  WebhookEventMetadata,
  WebhookProviderConfig,
  WebhookResult,
} from "../WebhookProvider";
import { WebhookProvider } from "../WebhookProvider";
import type { AxiosInstance } from "axios";

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
 * payload parsing, metadata extraction, and message formatting.
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
    const action = payload.action as string | undefined;
    return action;
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

  /**
   * Format comment body from webhook result
   *
   * Creates a formatted markdown comment with status, commit info,
   * PR link, and error details.
   *
   * @param result - Webhook execution result
   * @returns Formatted markdown comment body
   */
  protected formatCommentBody(result: WebhookResult): string {
    const status = result.success ? "Success" : "Failed";
    const icon = result.success ? "✅" : "❌";

    let body = `## ${icon} ${status}\n\n`;

    if (result.commitHash) {
      body += `**Commit:** \`${result.commitHash}\`\n\n`;
    }

    if (result.pullRequestUrl) {
      body += `**Pull Request:** ${result.pullRequestUrl}\n\n`;
    }

    if (result.errorMessage) {
      body += `**Error:**\n\`\`\`\n${this.escapeMarkdown(result.errorMessage)}\n\`\`\`\n\n`;
    }

    if (result.details) {
      body += `**Details:**\n${this.escapeMarkdown(result.details)}\n`;
    }

    return body;
  }

  /**
   * Format labels based on success/failure status
   *
   * Returns label updates for marking issues with execution status.
   *
   * @param success - Whether execution succeeded
   * @param customLabels - Optional custom success/failure labels
   * @returns Object with add and remove arrays
   */
  protected formatLabels(
    success: boolean,
    customLabels?: { success: string; failure: string },
  ): { add: string[]; remove: string[] } {
    const successLabel = customLabels?.success || "fix-submitted";
    const failureLabel = customLabels?.failure || "fix-failed";

    if (success) {
      return {
        add: [successLabel],
        remove: [failureLabel],
      };
    }

    return {
      add: [failureLabel],
      remove: [successLabel],
    };
  }

  /**
   * Escape special markdown characters
   *
   * @param text - Text to escape
   * @returns Escaped text
   */
  protected escapeMarkdown(text: string): string {
    // Escape characters that have special meaning in markdown
    return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, "\\$1");
  }

  /**
   * Parse owner/repo from provider project ID
   *
   * @param projectId - Provider project ID (e.g., 'owner/repo')
   * @returns Object with owner and repo properties
   */
  protected parseProjectId(projectId: string): { owner: string; repo: string } {
    const parts = projectId.split("/");

    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts.slice(1).join("/") };
    }

    // Single value, treat as repo with no owner path
    return { owner: "", repo: parts[0] };
  }

  /**
   * Create axios instance with Bearer token authentication
   *
   * @param baseUrl - API base URL
   * @param token - Authentication token
   * @returns Configured axios instance
   */
  protected createAuthenticatedClient(
    baseUrl: string,
    token: string,
  ): AxiosInstance {
    const axios = require("axios");

    return axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Viberglass-Webhook/1.0",
      },
    });
  }

  /**
   * Handle API errors from outbound calls
   *
   * @param error - Error from axios
   * @param context - Context string for error message
   * @throws Error with context
   */
  protected handleApiError(error: unknown, context: string): never {
    const axiosError = error as {
      response?: { status?: number; data?: unknown };
      request?: unknown;
      message?: string;
    };

    if (axiosError.response) {
      const status = axiosError.response.status;
      const data = axiosError.response.data;
      throw new Error(`${context}: HTTP ${status} - ${JSON.stringify(data)}`);
    }

    if (axiosError.request) {
      throw new Error(`${context}: No response received`);
    }

    throw new Error(`${context}: ${axiosError.message || "Unknown error"}`);
  }
}
