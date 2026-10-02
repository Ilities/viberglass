import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import type { CredentialRequest } from "@viberglass/types";
import { Logger } from "winston";

/**
 * Loads the credentials a run asks for. Docker workers already have them in their
 * environment; ECS and Lambda workers read each from the SSM path the platform sends.
 *
 * Features:
 * - 5-minute cache to reduce SSM API calls
 * - Batch credential fetching via getCredentials()
 * - Required credential validation with soft fail
 */
export class CredentialProvider {
  private ssmClient: SSMClient;
  private cache: Map<string, { value: string; expiry: number }>;
  private readonly ttl: number;
  private pathPrefix: string;
  private logger: Logger;

  constructor(
    logger: Logger,
    config?: {
      region?: string;
      pathPrefix?: string;
    },
  ) {
    this.logger = logger;
    const tenantPathPrefix =
      config?.pathPrefix || process.env.SSM_PARAMETER_PREFIX;
    const legacyTenantPathPrefix = process.env.TENANT_CONFIG_PATH_PREFIX;
    const hasConfiguredSecretsPrefix =
      typeof process.env.SECRETS_SSM_PREFIX === "string" &&
      process.env.SECRETS_SSM_PREFIX.trim().length > 0;
    const secretsPathPrefix =
      process.env.SECRETS_SSM_PREFIX || "/viberator/secrets";

    if (tenantPathPrefix) {
      this.pathPrefix = this.normalizePrefix(tenantPathPrefix);
    } else if (hasConfiguredSecretsPrefix) {
      this.pathPrefix = this.normalizePrefix(secretsPathPrefix);
    } else if (legacyTenantPathPrefix) {
      this.pathPrefix = this.normalizePrefix(legacyTenantPathPrefix);
    } else {
      this.pathPrefix = this.normalizePrefix(secretsPathPrefix);
    }

    this.ssmClient = new SSMClient({
      region: config?.region || process.env.AWS_REGION || "eu-west-1",
    });

    this.cache = new Map();
    this.ttl = 1000 * 60 * 5; // 5 minutes
  }

  private normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim();
    const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return prefixed.replace(/\/+$/, "");
  }

  /**
   * Get the SSM parameter name for a key (non-tenant-scoped)
   * Used for shared secrets like Codex auth cache
   *
   * @param key - The credential key
   * @returns The full SSM parameter path
   */
  getSharedParameterName(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return `${this.pathPrefix}/${safeKey}`;
  }

  /**
   * Fetch a raw value directly from SSM without env var fallback
   * Used for shared secrets like Codex auth cache that are never passed via env vars
   *
   * @param parameterName - The full SSM parameter path
   * @returns The parameter value or undefined if not found
   */
  async getRawSsmValue(parameterName: string): Promise<string | undefined> {
    // Check cache first
    const cached = this.cache.get(parameterName);
    if (cached && cached.expiry > Date.now()) {
      this.logger.debug("Raw SSM cache hit", { parameterName });
      return cached.value;
    }

    try {
      const response = await this.ssmClient.send(
        new GetParameterCommand({
          Name: parameterName,
          WithDecryption: true,
        }),
      );

      const value = response.Parameter?.Value;
      if (value) {
        this.cache.set(parameterName, {
          value,
          expiry: Date.now() + this.ttl,
        });
        this.logger.debug("Raw value fetched from SSM", { parameterName });
      }

      return value;
    } catch (error) {
      const err = error as { name?: string; message?: string };
      const errorName = err.name;
      if (errorName === "ParameterNotFound") {
        this.logger.debug("Raw SSM parameter not found", {
          parameterName,
        });
        return undefined;
      }
      if (
        errorName === "AccessDeniedException" ||
        errorName === "UnrecognizedClientException" ||
        errorName === "InvalidClientTokenId" ||
        errorName === "ExpiredTokenException" ||
        errorName === "CredentialsProviderError"
      ) {
        this.logger.warn("Raw SSM fetch skipped due to AWS credentials issue", {
          parameterName,
          error: errorName || "UnknownCredentialsError",
          message: err.message,
        });
        return undefined;
      }

      throw error;
    }
  }

  /** One credential: from the environment when the worker was started with it, else from SSM. */
  async getCredential(request: CredentialRequest): Promise<string | undefined> {
    if (process.env[request.envVar]) {
      this.logger.debug("Credential found in environment", { envVar: request.envVar });
      return process.env[request.envVar];
    }

    if (!request.ssmPath) {
      this.logger.warn("Credential not in environment and not stored in SSM", { envVar: request.envVar });
      return undefined;
    }

    return this.getRawSsmValue(request.ssmPath);
  }

  /** Every requested credential, by env var; missing ones are undefined. */
  async getCredentials(
    requests: CredentialRequest[],
  ): Promise<Record<string, string | undefined>> {
    const results: Record<string, string | undefined> = {};

    await Promise.all(
      requests.map(async (request) => {
        results[request.envVar] = await this.getCredential(request);
      }),
    );

    return results;
  }

  /** Logs the requested credentials that couldn't be loaded; never throws. */
  validateRequired(
    credentials: Record<string, string | undefined>,
    requests: CredentialRequest[],
  ): { valid: boolean; missing: string[] } {
    const missing = requests.map((request) => request.envVar).filter((envVar) => !credentials[envVar]);

    if (missing.length > 0) {
      this.logger.warn("Missing required credentials", {
        missing: missing.join(", "),
      });
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Clear the credential cache
   * Useful for testing or force-refresh scenarios
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug("Credential cache cleared");
  }
}
