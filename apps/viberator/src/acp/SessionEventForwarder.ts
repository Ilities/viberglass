import { Logger } from "winston";
import type { PlatformSessionEvent } from "./types";
import type { CallbackClient } from "../workers";

export class SessionEventForwarder {
  private currentJobId?: string;
  private currentTenantId?: string;
  private eventBatch: PlatformSessionEvent[] = [];
  private batchTimer?: NodeJS.Timeout;

  constructor(
    private readonly callbackClient: CallbackClient,
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
    if (this.eventBatch.length === 0) return;
    if (!this.currentJobId || !this.currentTenantId) return;

    const batch = [...this.eventBatch];
    this.eventBatch = [];

    await this.callbackClient.sendSessionEventBatch(
      this.currentJobId,
      this.currentTenantId,
      batch.map((e) => ({ eventType: e.eventType, payload: e.payload })),
    );
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
