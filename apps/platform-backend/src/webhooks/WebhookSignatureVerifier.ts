import type { WebhookReceiver } from "@viberglass/integration-core";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import type { WebhookSecretService } from "./WebhookSecretService";

export type SignatureCheck = { valid: true } | { valid: false; reason: string };

export interface SignedDelivery {
  receiver: WebhookReceiver;
  config: WebhookConfig;
  headers: Record<string, string>;
  rawBody: Buffer;
  tenantId?: string;
}

/** Checks a delivery's signature against its webhook's secret before anything else reads it. */
export class WebhookSignatureVerifier {
  constructor(private readonly secrets: Pick<WebhookSecretService, "getSecret">) {}

  async verify(delivery: SignedDelivery): Promise<SignatureCheck> {
    // Every webhook must have a secret. An unsigned delivery is an unauthenticated
    // request that can create tickets, and ticket bodies reach the agent prompt verbatim.
    const secret = await this.secretOf(delivery);
    if (!secret) {
      return { valid: false, reason: "Webhook secret is not configured" };
    }
    const signature = delivery.receiver.signatureOf(delivery.headers);
    if (!signature) {
      return { valid: false, reason: "Missing signature header" };
    }
    if (!delivery.receiver.verifySignature(delivery.rawBody, signature, secret)) {
      return { valid: false, reason: "Invalid signature" };
    }
    return { valid: true };
  }

  private async secretOf({ config, tenantId }: SignedDelivery): Promise<string | undefined> {
    try {
      return await this.secrets.getSecret(
        {
          secretLocation: config.secretLocation,
          secretPath: config.secretPath || undefined,
          webhookSecret: config.webhookSecretEncrypted || undefined,
        },
        tenantId,
      );
    } catch {
      return undefined;
    }
  }
}
