import type { CredentialProvider } from "../credentials";
import type { WebhookSecretCipher } from "./WebhookSecretCipher";

/** Where a webhook's secret is kept. */
export interface WebhookSecretSource {
  secretLocation?: "database" | "ssm" | "env";
  secretPath?: string;
  /** The encrypted secret, for database storage. */
  webhookSecret?: string;
}

/**
 * Reads a webhook's secret from where it is kept: encrypted in the database,
 * in SSM through the credential provider, or in an environment variable.
 */
export class WebhookSecretService {
  constructor(
    private credentialProvider: Pick<CredentialProvider, "get">,
    private cipher: Pick<WebhookSecretCipher, "decrypt">,
  ) {}

  /** The plaintext secret; projectId scopes SSM lookups. */
  async getSecret(
    config: WebhookSecretSource,
    projectId?: string,
  ): Promise<string> {
    const location = config.secretLocation ?? "database";

    switch (location) {
      case "database": {
        if (!config.webhookSecret) {
          throw new Error(
            "Webhook secret not found in configuration (database storage requested)",
          );
        }
        return this.cipher.decrypt(config.webhookSecret);
      }

      case "ssm": {
        if (!config.secretPath) {
          throw new Error(
            "SSM secret path not configured (secretPath required for SSM storage)",
          );
        }
        if (!projectId) {
          throw new Error("Project ID required for SSM secret lookup");
        }

        const secret = await this.credentialProvider.get(
          projectId,
          config.secretPath,
        );

        if (!secret) {
          throw new Error(
            `Secret not found in SSM at path: ${config.secretPath}`,
          );
        }

        return secret;
      }

      case "env": {
        const envVar = config.secretPath || "WEBHOOK_SECRET";
        const secret = process.env[envVar];

        if (!secret) {
          throw new Error(
            `Environment variable ${envVar} not set (env storage requested)`,
          );
        }

        return secret;
      }

      default:
        throw new Error(
          `Unsupported secret location: ${(location as string).toString()}`,
        );
    }
  }
}
