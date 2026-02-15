import { CredentialProvider } from "./CredentialProvider";
import { EnvironmentProvider } from "./providers/EnvironmentProvider";
import { FileProvider } from "./providers/FileProvider";
import { AwsSsmProvider } from "./providers/AwsSsmProvider";
import type { CredentialConfig } from "../config/credentials";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ component: "CredentialProviderFactory" });

/**
 * Credential Provider Factory
 *
 * Implements fallback chain pattern:
 * - Providers tried in order: Environment -> File -> AWS
 * - First success wins (no cascading across providers for same key)
 * - Provider failures logged as warnings, operation continues
 */
export class CredentialProviderFactory implements CredentialProvider {
  readonly name = "CredentialProviderFactory";
  private providers: CredentialProvider[];

  constructor(config: CredentialConfig = {}) {
    this.providers = this.initializeProviders(config);
  }

  /**
   * Initialize providers in fallback order
   * Order is fixed: Environment -> File -> AWS
   */
  private initializeProviders(config: CredentialConfig): CredentialProvider[] {
    const providers: CredentialProvider[] = [];

    // 1. Environment provider (always enabled as first fallback)
    if (config.environment?.enabled !== false) {
      providers.push(new EnvironmentProvider());
    }

    // 2. File provider (local development)
    if (config.file?.enabled) {
      try {
        providers.push(
          new FileProvider({
            filePath: config.file.filePath,
            encryptionKey: config.file.encryptionKey,
          }),
        );
      } catch (error) {
        logger.warn("Failed to initialize FileProvider", {
          error: (error as Error).message,
        });
      }
    }

    // 3. AWS SSM provider (production)
    if (config.aws?.enabled) {
      try {
        providers.push(
          new AwsSsmProvider({
            region: config.aws.region,
            pathPrefix: config.aws.pathPrefix,
          }),
        );
      } catch (error) {
        logger.warn("Failed to initialize AwsSsmProvider", {
          error: (error as Error).message,
        });
      }
    }

    if (providers.length === 0) {
      throw new Error(
        "No credential providers configured. Enable at least one provider.",
      );
    }

    logger.info("Initialized providers", {
      count: providers.length,
      providers: providers.map((p) => p.name),
    });

    return providers;
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    let lastError: Error | undefined;

    for (const provider of this.providers) {
      try {
        const value = await provider.get(tenantId, key);

        if (value !== null) {
          logger.debug("Credential found", {
            tenantId,
            key,
            provider: provider.name,
          });
          return value;
        }
      } catch (error) {
        lastError = error as Error;
        logger.warn("Provider failed, trying next", {
          tenantId,
          key,
          provider: provider.name,
          error: (error as Error).message,
        });
      }
    }

    // All providers exhausted
    if (lastError) {
      logger.warn("All providers failed", {
        tenantId,
        key,
        lastError: lastError.message,
      });
    }

    return null;
  }

  /**
   * Put credential to primary provider only
   * (Usually the first available provider; others are read-only fallbacks)
   */
  async put(tenantId: string, key: string, value: string): Promise<void> {
    // Use first provider that supports writes (not EnvironmentProvider which is read-only)
    for (const provider of this.providers) {
      try {
        await provider.put(tenantId, key, value);
        logger.info("Credential stored", {
          tenantId,
          key,
          provider: provider.name,
        });
        return;
      } catch (error) {
        if ((error as Error).message.includes("read-only")) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("No writable credential provider available");
  }

  async delete(tenantId: string, key: string): Promise<void> {
    // Use first provider that supports deletes
    for (const provider of this.providers) {
      try {
        await provider.delete(tenantId, key);
        logger.info("Credential deleted", {
          tenantId,
          key,
          provider: provider.name,
        });
        return;
      } catch (error) {
        if ((error as Error).message.includes("read-only")) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("No writable credential provider available");
  }

  async isAvailable(): Promise<boolean> {
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        return true;
      }
    }
    return false;
  }

  async listKeys(tenantId: string): Promise<string[]> {
    for (const provider of this.providers) {
      if (typeof provider.listKeys === "function") {
        try {
          const keys = await provider.listKeys(tenantId);
          if (keys.length > 0) {
            return keys;
          }
        } catch (error) {
          logger.warn("Failed to list keys from provider", {
            tenantId,
            provider: provider.name,
            error: (error as Error).message,
          });
        }
      }
    }
    return [];
  }

  getProviders(): CredentialProvider[] {
    return [...this.providers];
  }
}
