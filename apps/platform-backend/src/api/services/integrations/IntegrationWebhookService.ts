import type { ParsedQs } from "qs";
import type {
  DeliveryListResult,
  RetryInboundDeliveryResult,
  UpsertInboundWebhookConfigInput,
  UpsertOutboundWebhookConfigInput,
} from "./types";
import { InboundWebhookConfigOrchestrator } from "./InboundWebhookConfigOrchestrator";
import { OutboundWebhookConfigOrchestrator } from "./OutboundWebhookConfigOrchestrator";
import { WebhookDeliveryOrchestrator } from "./WebhookDeliveryOrchestrator";

export class IntegrationWebhookService {
  constructor(
    private readonly inboundOrchestrator = new InboundWebhookConfigOrchestrator(),
    private readonly outboundOrchestrator = new OutboundWebhookConfigOrchestrator(),
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

  async listOutboundWebhookConfigs(integrationId: string) {
    return this.outboundOrchestrator.listOutboundWebhookConfigs(integrationId);
  }

  async createOutboundWebhookConfig(
    integrationId: string,
    input: UpsertOutboundWebhookConfigInput,
  ) {
    return this.outboundOrchestrator.createOutboundWebhookConfig(
      integrationId,
      input,
    );
  }

  async getOutboundWebhookConfig(integrationId: string, configId: string) {
    return this.outboundOrchestrator.getOutboundWebhookConfig(
      integrationId,
      configId,
    );
  }

  async updateOutboundWebhookConfig(
    integrationId: string,
    configId: string,
    input: UpsertOutboundWebhookConfigInput,
  ) {
    return this.outboundOrchestrator.updateOutboundWebhookConfig(
      integrationId,
      configId,
      input,
    );
  }

  async deleteOutboundWebhookConfig(integrationId: string, configId: string) {
    return this.outboundOrchestrator.deleteOutboundWebhookConfig(
      integrationId,
      configId,
    );
  }

  async listOutboundWebhookDeliveries(
    integrationId: string,
    configId: string,
    query: ParsedQs | { [key: string]: unknown },
  ): Promise<DeliveryListResult> {
    return this.deliveryOrchestrator.listOutboundWebhookDeliveries(
      integrationId,
      configId,
      query,
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
