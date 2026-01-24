import { SecretService, SecretMetadata } from "./SecretService";
import { SecretDAO } from "../persistence/secret/SecretDAO";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ service: "SecretResolutionService" });

export class SecretResolutionService {
  private secretService = new SecretService();
  private secretDAO = new SecretDAO();

  /**
   * Resolve secret values for selected secret IDs (for DockerInvoker)
   * Returns a map of secret name to secret value
   */
  async resolveSecretsForClanker(
    secretIds: string[],
  ): Promise<Record<string, string>> {
    if (secretIds.length === 0) {
      logger.debug("No secrets to resolve");
      return {};
    }

    logger.debug(`Resolving ${secretIds.length} secrets`, { secretIds });

    // Get all available secrets
    const allSecrets = await this.secretService.resolveSecrets();

    // Get metadata for selected secrets
    const secretRecords = await Promise.all(
      secretIds.map((id) => this.secretDAO.getSecret(id)),
    );

    // Filter to only selected secrets
    const filtered: Record<string, string> = {};
    for (const record of secretRecords) {
      if (record && allSecrets[record.name]) {
        filtered[record.name] = allSecrets[record.name];
        logger.debug(`Resolved secret: ${record.name}`);
      } else if (record) {
        logger.warn(`Secret value not found for: ${record.name}`);
      }
    }

    logger.debug(`Resolved ${Object.keys(filtered).length} secret values`);
    return filtered;
  }

  /**
   * Get secret metadata for selected secret IDs (for ECS/Lambda invokers)
   * Returns array of secret metadata that workers can use to resolve secrets at runtime
   */
  async getSecretMetadataForClanker(
    secretIds: string[],
  ): Promise<SecretMetadata[]> {
    if (secretIds.length === 0) {
      logger.debug("No secret metadata to fetch");
      return [];
    }

    logger.debug(`Fetching metadata for ${secretIds.length} secrets`, {
      secretIds,
    });

    const metadata = await Promise.all(
      secretIds.map((id) => this.secretService.getSecret(id)),
    );

    // Filter out nulls (secrets that don't exist)
    const validMetadata = metadata.filter(
      (s): s is SecretMetadata => s !== null,
    );

    logger.debug(`Fetched metadata for ${validMetadata.length} secrets`);
    return validMetadata;
  }
}
