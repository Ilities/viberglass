import type { WebhookConfig, WebhookConfigDAO } from "../persistence/webhook/WebhookConfigDAO";
import type { WebhookSecretService } from "./WebhookSecretService";

/**
 * Keeps the secret a sender hands over in a handshake, encrypted as an
 * admin-pasted secret is. A webhook that already has a secret keeps it, so a
 * handshake can't replace the secret that signs its deliveries.
 */
export class WebhookHandshake {
  constructor(
    private readonly configDAO: Pick<WebhookConfigDAO, "updateConfig">,
    private readonly secrets: Pick<WebhookSecretService, "encryptSecret">,
  ) {}

  async remember(config: WebhookConfig, secret: string): Promise<void> {
    if (config.secretLocation !== "database" || config.webhookSecretEncrypted) return;
    const encrypted = await this.secrets.encryptSecret(secret);
    await this.configDAO.updateConfig(config.id, { webhookSecretEncrypted: encrypted });
  }
}
