import axios, { type AxiosInstance } from "axios";
import crypto from "crypto";
import { BaseWebhookProvider } from "./BaseWebhookProvider";
import type {
  ParsedWebhookEvent,
  WebhookProviderConfig,
  WebhookResult,
} from "../WebhookProvider";
import type { ShortcutWebhookProviderDependencies } from "./shortcut/shortcutDependencies";
import type { ShortcutStory } from "./shortcut/shortcutTypes";

export { createShortcutWebhookProviderDependencies } from "./shortcut/createShortcutWebhookProviderDependencies";
export type { ShortcutWebhookProviderDependencies } from "./shortcut/shortcutDependencies";

const SUPPORTED_EVENTS = [
  "story_created",
  "story_updated",
  "story_deleted",
  "comment_created",
  "comment_updated",
  "comment_deleted",
];

function verifyShortcutSignature(
  payload: Buffer,
  signature: string,
  secret: string,
): boolean {
  const receivedSignature = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  if (!/^[0-9a-fA-F]{64}$/.test(receivedSignature)) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  const receivedBuffer = Buffer.from(receivedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export class ShortcutWebhookProvider extends BaseWebhookProvider {
  readonly name = "shortcut";

  constructor(
    config: WebhookProviderConfig,
    private readonly dependencies: ShortcutWebhookProviderDependencies,
  ) {
    super(config);
  }

  parseEvent(
    payload: unknown,
    headers: Record<string, string>,
  ): ParsedWebhookEvent {
    const parsed = this.dependencies.payloadParser.parse(payload, headers);

    return {
      provider: "shortcut",
      eventType: parsed.eventType,
      deduplicationId: parsed.deduplicationId,
      timestamp: parsed.timestamp,
      payload: parsed.payload,
      metadata: parsed.metadata,
    };
  }

  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    return verifyShortcutSignature(payload, signature, secret);
  }

  getSupportedEvents(): string[] {
    return SUPPORTED_EVENTS;
  }

  validateConfig(config: WebhookProviderConfig): boolean {
    if (!config.webhookSecret && config.secretLocation === "database") {
      return false;
    }
    if (!config.apiToken) {
      return false;
    }
    return !(
      !Array.isArray(config.allowedEvents) || config.allowedEvents.length === 0
    );
  }

  async postComment(storyId: string, body: string): Promise<void> {
    await this.dependencies.storyClient.postComment(
      this.getHttpClient(),
      storyId,
      body,
      (error, context) => this.handleApiError(error, context),
    );
  }

  async updateLabels(
    storyId: string,
    add: string[],
    remove: string[],
  ): Promise<void> {
    await this.dependencies.storyClient.updateLabels(
      this.getHttpClient(),
      storyId,
      add,
      remove,
      (error, context) => this.handleApiError(error, context),
    );
  }

  async postResult(storyId: string, result: WebhookResult): Promise<void> {
    const commentBody = this.formatCommentBody(result);
    await this.postComment(storyId, commentBody);

    const settings = this.dependencies.configResolver.resolveOutboundSettings(
      this.config,
    );
    if (!settings.skipLabelUpdates) {
      const { add, remove } = this.formatLabels(result.success, {
        success: settings.successLabel,
        failure: settings.failureLabel,
      });
      await this.updateLabels(storyId, add, remove);
    }

    const workflowStateId = result.success
      ? settings.successWorkflowStateId
      : settings.failureWorkflowStateId;
    if (workflowStateId) {
      await this.updateStoryState(storyId, workflowStateId);
    }
  }

  protected createHttpClient(): AxiosInstance {
    const apiBaseUrl = this.dependencies.configResolver.resolveApiBaseUrl(
      this.config,
    );
    const token = this.config.apiToken || "";

    return axios.create({
      baseURL: apiBaseUrl,
      headers: {
        "Shortcut-Token": token,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Viberglass-Webhook/1.0",
      },
      timeout: 30000,
    });
  }

  async getStory(storyId: string): Promise<ShortcutStory> {
    return this.dependencies.storyClient.getStory(
      this.getHttpClient(),
      storyId,
      (error, context) => this.handleApiError(error, context),
    );
  }

  async updateStoryState(
    storyId: string,
    workflowStateId: number,
  ): Promise<void> {
    await this.dependencies.storyClient.updateStoryState(
      this.getHttpClient(),
      storyId,
      workflowStateId,
      (error, context) => this.handleApiError(error, context),
    );
  }

  async addOwner(storyId: string, memberId: string): Promise<void> {
    await this.dependencies.storyClient.addOwner(
      this.getHttpClient(),
      storyId,
      memberId,
      (error, context) => this.handleApiError(error, context),
    );
  }
}
