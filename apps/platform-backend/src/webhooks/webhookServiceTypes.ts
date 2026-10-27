export interface WebhookProcessingResult {
  /** `invalid`: the sender has to fix its request; `not_found`: no webhook has this address; `handshake`: a setup request whose secret was stored and must be echoed back. */
  status: "processed" | "ignored" | "rejected" | "duplicate" | "failed" | "invalid" | "not_found" | "handshake";
  ticketId?: string;
  jobId?: string;
  reason?: string;
  existingId?: string;
  /** The secret to echo back for a `handshake`, so the sender can finish setting up. */
  secret?: string;
}

export interface WebhookServiceConfig {
  enableAutoExecute?: boolean;
  defaultTenantId?: string;
}

export interface WebhookProcessingOptions {
  /** The webhook provider in the delivery's address. */
  providerName: string;
  configId?: string;
}

export interface RetryDeliveryOptions {
  deliveryAttemptId?: string;
  webhookConfigId?: string;
}
