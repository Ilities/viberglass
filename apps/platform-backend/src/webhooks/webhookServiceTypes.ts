export interface WebhookProcessingResult {
  /** `invalid`: the sender has to fix its request; `not_found`: no webhook has this address. */
  status: "processed" | "ignored" | "rejected" | "duplicate" | "failed" | "invalid" | "not_found";
  ticketId?: string;
  jobId?: string;
  reason?: string;
  existingId?: string;
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
