import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { Logger } from "winston";

/**
 * CredentialProvider for worker-side credential fetching from SSM
 *
 * Fetches tenant credentials from SSM Parameter Store using platform AWS credentials.
 * Path structure: /prefix/{tenantId}/{key}
 * Example: /viberator/tenants/tenant-123/GITHUB_TOKEN
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

  constructor(logger: Logger, config?: { region?: string; pathPrefix?: string }) {
    this.logger = logger;
    this.pathPrefix =
      config?.pathPrefix ||
      process.env.TENANT_CONFIG_PATH_PREFIX ||
      "/viberator/tenants";

    this.ssmClient = new SSMClient({
      region: config?.region || process.env.AWS_REGION || "us-east-1",
    });

    this.cache = new Map();
    this.ttl = 1000 * 60 * 5; // 5 minutes
  }

  /**
   * Transform credential key to environment variable name
   * Converts lowercase/kebab-case to UPPERCASE_WITH_UNDERSCORES
   * Example: github_token -> GITHUB_TOKEN
   */
  private keyToEnvVar(key: string): string {
    return key.toUpperCase().replace(/-/g, '_');
  }

  /**
   * Fetch a single credential for a tenant
   *
   * For Docker workers: checks process.env first (credentials from -e flags)
   * For AWS workers: fetches from SSM Parameter Store
   *
   * @param tenantId - Tenant identifier
   * @param key - Credential key (e.g., "github_token")
   * @returns Credential value or undefined if not found
   */
  async getCredential(
    tenantId: string,
    key: string
  ): Promise<string | undefined> {
    const envVar = this.keyToEnvVar(key);

    // Check environment variable first (Docker workers receive creds via -e flags)
    if (process.env[envVar]) {
      this.logger.debug("Credential found in environment", { envVar, key });
      return process.env[envVar];
    }

    // Fall back to SSM for AWS workers (Lambda/ECS)
    const parameterName = `${this.pathPrefix}/${tenantId}/${key}`;

    // Check cache first
    const cached = this.cache.get(parameterName);
    if (cached && cached.expiry > Date.now()) {
      this.logger.debug("Credential cache hit", { parameterName });
      return cached.value;
    }

    try {
      const response = await this.ssmClient.send(
        new GetParameterCommand({
          Name: parameterName,
          WithDecryption: true,
        })
      );

      const value = response.Parameter?.Value;
      if (value) {
        this.cache.set(parameterName, {
          value,
          expiry: Date.now() + this.ttl,
        });
        this.logger.debug("Credential fetched from SSM", { parameterName });
      }

      return value;
    } catch (error) {
      const errorName = (error as { name?: string }).name;
      if (errorName === "ParameterNotFound") {
        this.logger.warn("Credential not found in SSM", {
          parameterName,
          error: errorName,
        });
        return undefined; // Soft fail per CONTEXT.md
      }
      throw error;
    }
  }

  /**
   * Fetch multiple credentials for a tenant in parallel
   *
   * @param tenantId - Tenant identifier
   * @param keys - Array of credential keys to fetch
   * @returns Map of key -> value (missing keys have undefined value)
   */
  async getCredentials(
    tenantId: string,
    keys: string[]
  ): Promise<Record<string, string | undefined>> {
    const results: Record<string, string | undefined> = {};

    await Promise.all(
      keys.map(async (key) => {
        results[key] = await this.getCredential(tenantId, key);
      })
    );

    return results;
  }

  /**
   * Validate that required credentials are present
   * Logs warnings for missing credentials but doesn't throw
   *
   * @param credentials - Fetched credentials map
   * @param required - Array of required credential keys
   * @returns Validation result with validity flag and missing keys
   */
  validateRequired(
    credentials: Record<string, string | undefined>,
    required: string[]
  ): { valid: boolean; missing: string[] } {
    const missing = required.filter((key) => !credentials[key]);

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
