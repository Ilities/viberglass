import type { ParsedQs } from "qs";
import type {
  DeliveryListResult,
  RetryInboundDeliveryResult,
  UpsertInboundWebhookConfigInput,
} from "./types";
import { InboundWebhookConfigOrchestrator } from "./InboundWebhookConfigOrchestrator";
import { WebhookDeliveryOrchestrator } from "./WebhookDeliveryOrchestrator";

export class IntegrationWebhookService {
  constructor(
    private readonly inboundOrchestrator = new InboundWebhookConfigOrchestrator(),
    private readonly deliveryOrchestrator = new WebhookDeliveryOrchestrator(),
  ) {}

  async listInboundWebhookConfigs(integrationId: string) {
    return this.inboundOrchestrator.listInboundWebhookConfigs(integrationId);
  }

  async createInboundWebhookConfig(
    integrationId: string,
    input: UpsertInboundWebhookConfigInput,
  ) {
    return this.inboundOrchestrator.createInboundWebhookConfig(
      integrationId,
      input,
    );
  }

  async updateInboundWebhookConfig(
    integrationId: string,
    configId: string,
    input: UpsertInboundWebhookConfigInput,
  ) {
    return this.inboundOrchestrator.updateInboundWebhookConfig(
      integrationId,
      configId,
      input,
    );
  }

  async deleteInboundWebhookConfig(integrationId: string, configId: string) {
    return this.inboundOrchestrator.deleteInboundWebhookConfig(
      integrationId,
      configId,
    );
  }

  async listInboundWebhookDeliveries(
    integrationId: string,
    configId: string,
    query: ParsedQs | { [key: string]: unknown },
  ): Promise<DeliveryListResult> {
    return this.deliveryOrchestrator.listInboundWebhookDeliveries(
      integrationId,
      configId,
      query,
    );
  }

  async retryInboundWebhookDelivery(
    integrationId: string,
    configId: string,
    deliveryId: string,
  ): Promise<RetryInboundDeliveryResult> {
    return this.deliveryOrchestrator.retryInboundWebhookDelivery(
      integrationId,
      configId,
      deliveryId,
    );
  }
}
