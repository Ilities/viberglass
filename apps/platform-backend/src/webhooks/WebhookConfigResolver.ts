import type {
  WebhookConfig,
  WebhookConfigDAO,
} from "../persistence/webhook/WebhookConfigDAO";

export interface ResolveWebhookConfigOptions {
  providerName: WebhookConfig["provider"];
  configId?: string;
}

/** Finds the webhook a delivery was sent to; its address carries the webhook's id. */
export class WebhookConfigResolver {
  constructor(private configDAO: Pick<WebhookConfigDAO, "getConfigById">) {}

  async resolveInboundConfig(options: ResolveWebhookConfigOptions): Promise<WebhookConfig | null> {
    if (!options.configId) return null;
    const config = await this.configDAO.getConfigById(options.configId);
    return config && config.provider === options.providerName ? config : null;
  }

  async getConfigById(configId: string): Promise<WebhookConfig | null> {
    return this.configDAO.getConfigById(configId);
  }
}
