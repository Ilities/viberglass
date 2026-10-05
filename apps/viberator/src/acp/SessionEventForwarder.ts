import { Logger } from "winston";
import type { PlatformSessionEvent } from "./types";
import type { TurnCallbackClient } from "../workers/infrastructure/TurnCallbackClient";

export class SessionEventForwarder {
  private currentJobId?: string;
  private currentTenantId?: string;
  private eventBatch: PlatformSessionEvent[] = [];
  private batchTimer?: NodeJS.Timeout;
  /** Batches go one at a time: sent side by side they can land out of order, and the reply's text with them. */
  private sending: Promise<void> = Promise.resolve();

  constructor(
    private readonly callbackClient: Pick<TurnCallbackClient, "sendSessionEventBatch">,
    private readonly logger: Logger,
    private readonly batchSize: number = 20,
    private readonly batchIntervalMs: number = 1000,
  ) {}

  setupForJob(jobId: string, tenantId: string): void {
    this.currentJobId = jobId;
    this.currentTenantId = tenantId;
    this.eventBatch = [];
  }

  enqueue(event: PlatformSessionEvent): void {
    this.eventBatch.push(event);
    if (this.eventBatch.length >= this.batchSize) {
      this.flush().catch((err) => {
        this.logger.error("Failed to flush session event batch", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flush().catch((err) => {
          this.logger.error("Failed to flush session event batch on timer", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }, this.batchIntervalMs);
    }
  }

  async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
    if (this.eventBatch.length === 0) return this.sending;
    if (!this.currentJobId || !this.currentTenantId) return;

    const jobId = this.currentJobId;
    const tenantId = this.currentTenantId;
    const batch = this.eventBatch.map((e) => ({ eventType: e.eventType, payload: e.payload }));
    this.eventBatch = [];

    const sent = this.sending.then(() => this.callbackClient.sendSessionEventBatch(jobId, tenantId, batch));
    this.sending = sent.catch(() => undefined);
    await sent;
  }

  cleanup(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
    this.currentJobId = undefined;
    this.currentTenantId = undefined;
    this.eventBatch = [];
  }
}
