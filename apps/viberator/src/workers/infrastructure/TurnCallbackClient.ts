import { Logger } from "winston";
import { FetchRetryConfig, fetchWithRetry, postForJson } from "./callbackFetch";

/** Where a worker's callbacks go, and how hard to try. */
export interface CallbackTarget {
  apiUrl: string;
  maxRetries: number;
  retryDelay: number;
  callbackToken?: string;
}

/**
 * What a task turn's worker tells the platform besides its result: the
 * session's events and its harness state, the agent's questions to people,
 * and what a stopped turn had done.
 */
export class TurnCallbackClient {
  constructor(
    private readonly logger: Logger,
    private readonly target: CallbackTarget,
  ) {}

  async sendSessionEventBatch(
    jobId: string,
    tenantId: string,
    events: Array<{ eventType: string; payload: Record<string, unknown> }>,
  ): Promise<void> {
    if (events.length === 0) return;

    await this.post(
      `${this.target.apiUrl}/api/jobs/${jobId}/session-events/batch`,
      tenantId,
      { events },
      { timeoutMs: 10000, label: "session event batch" },
      { jobId, count: events.length },
    );
  }

  async sendAcpSessionId(
    jobId: string,
    tenantId: string,
    acpSessionId: string,
  ): Promise<void> {
    await this.post(
      `${this.target.apiUrl}/api/jobs/${jobId}/acp-session-id`,
      tenantId,
      { acpSessionId },
      { timeoutMs: 10000, label: "ACP session ID" },
      { jobId },
    );
  }

  async sendConversationStateUrl(
    jobId: string,
    tenantId: string,
    conversationStateUrl: string,
  ): Promise<void> {
    await this.post(
      `${this.target.apiUrl}/api/jobs/${jobId}/conversation-state-url`,
      tenantId,
      { conversationStateUrl },
      { timeoutMs: 10000, label: "conversation state URL" },
      { jobId },
    );
  }

  /** What a turn had done when it was stopped, so it isn't lost: documents so far, and a work-in-progress commit. */
  async sendPartialResult(
    jobId: string,
    tenantId: string,
    partial: { documents: Partial<Record<"research" | "plan" | "summary", string>>; commitHash?: string; branch?: string },
  ): Promise<void> {
    // No retries: the worker is being stopped and has seconds left.
    await postForJson(`${this.target.apiUrl}/api/jobs/${jobId}/partial-result`, tenantId, partial, 5000, this.target.callbackToken);
  }

  /** Puts the agent's question to a person on the task; returns whom it reached. */
  async sendQuestion(
    jobId: string,
    tenantId: string,
    question: { question: string; options: string[]; addressee: string | null; blocking: boolean },
  ): Promise<{ askedOf: string | null; blocking: boolean }> {
    const body = await postForJson(`${this.target.apiUrl}/api/jobs/${jobId}/questions`, tenantId, question, 15000, this.target.callbackToken);
    const data = typeof body === "object" && body !== null && "data" in body ? body.data : null;
    const askedOf = typeof data === "object" && data !== null && "askedOf" in data && typeof data.askedOf === "string" ? data.askedOf : null;
    return { askedOf, blocking: question.blocking };
  }

  private async post(
    url: string,
    tenantId: string,
    body: unknown,
    config: FetchRetryConfig,
    context: Record<string, unknown>,
  ): Promise<void> {
    await fetchWithRetry(url, tenantId, body, config, context, {
      logger: this.logger,
      maxRetries: this.target.maxRetries,
      retryDelay: this.target.retryDelay,
      callbackToken: this.target.callbackToken,
    });
  }
}
