export interface WebhookProcessingResult {
  status: "processed" | "ignored" | "rejected" | "duplicate" | "failed";
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
  providerName?: "github" | "jira" | "shortcut" | "custom";
  configId?: string;
  integrationId?: string;
  providerProjectId?: string;
}

export interface RetryDeliveryOptions {
  deliveryAttemptId?: string;
  webhookConfigId?: string;
}
