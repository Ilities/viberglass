import { CredentialProvider } from "../CredentialProvider";
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
  DeleteParameterCommand,
  GetParametersByPathCommand,
} from "@aws-sdk/client-ssm";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { createChildLogger } from "../../config/logger";

const logger = createChildLogger({ component: "AwsSsmProvider" });

/**
 * AWS SSM Parameter Store credential provider
 * Uses hierarchical paths for tenant-scoped credentials
 *
 * Path structure: /prefix/{tenantId}/{key}
 * Example: /viberator/tenants/tenant-123/GITHUB_TOKEN
 *
 * Security properties:
 * - SecureString type uses AWS KMS for encryption at rest
 * - Hierarchical paths enable tenant-scoped IAM policies
 * - AWS credential chain supports Lambda, EC2, ECS, and local dev
 * - 5-minute in-memory cache to reduce SSM API calls
 * - Tenant/key sanitization prevents path traversal attacks
 */
export class AwsSsmProvider implements CredentialProvider {
  readonly name = "AwsSsmProvider";

  private client: SSMClient;
  private pathPrefix: string;
  private cache: Map<string, { value: string; expiry: number }> = new Map();
  private readonly ttl = 1000 * 60 * 5; // 5 minutes cache

  constructor(config: {
    region?: string;
    pathPrefix?: string;
    endpoint?: string; // For LocalStack testing
  }) {
    this.pathPrefix =
      config.pathPrefix ||
      process.env.SSM_PARAMETER_PREFIX ||
      "/viberator/tenants";

    // Ensure path prefix doesn't end with slash
    if (this.pathPrefix.endsWith("/")) {
      this.pathPrefix = this.pathPrefix.slice(0, -1);
    }

    // Initialize SSM client with credential chain
    this.client = new SSMClient({
      region: config.region || process.env.AWS_REGION || "eu-west-1",
      endpoint: config.endpoint, // For LocalStack
      credentialDefaultProvider: defaultProvider,
    });
  }

  /**
   * Build the full SSM parameter path for a tenant credential
   * Sanitizes tenantId and key to prevent path traversal and SSM-incompatible characters
   */
  private buildPath(tenantId: string, key: string): string {
    // Validate tenantId doesn't contain path traversal or SSM-incompatible characters
    // SSM allows alphanumeric, hyphen, underscore, dot, and forward slash
    const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_.-]/g, "-");
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "_");

    return `${this.pathPrefix}/${safeTenantId}/${safeKey}`;
  }

  /**
   * Get credential from SSM with caching
   */
  async get(tenantId: string, key: string): Promise<string | null> {
    const path = this.buildPath(tenantId, key);

    // Check cache first
    const cached = this.cache.get(path);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    try {
      const response = await this.client.send(
        new GetParameterCommand({
          Name: path,
          WithDecryption: true,
        }),
      );

      const value = response.Parameter?.Value ?? null;

      // Cache the result if found
      if (value) {
        this.cache.set(path, {
          value,
          expiry: Date.now() + this.ttl,
        });
      }

      return value;
    } catch (error) {
      const errorName = (error as { name?: string }).name;
      if (errorName === "ParameterNotFound") {
        return null;
      }

      // Log error but don't expose details
      logger.error("Failed to get parameter", { path });

      // Clear cache on error
      this.cache.delete(path);

      return null;
    }
  }

  /**
   * Store credential in SSM
   */
  async put(tenantId: string, key: string, value: string): Promise<void> {
    const path = this.buildPath(tenantId, key);

    try {
      await this.client.send(
        new PutParameterCommand({
          Name: path,
          Value: value,
          Type: "SecureString",
          Overwrite: true,
        }),
      );

      // Update cache
      this.cache.set(path, {
        value,
        expiry: Date.now() + this.ttl,
      });
    } catch (error) {
      logger.error("Failed to put parameter", { path });
      throw new Error(
        `Failed to store credential in SSM: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Delete credential from SSM
   */
  async delete(tenantId: string, key: string): Promise<void> {
    const path = this.buildPath(tenantId, key);

    try {
      await this.client.send(
        new DeleteParameterCommand({
          Name: path,
        }),
      );

      // Clear cache
      this.cache.delete(path);
    } catch (error) {
      const errorName = (error as { name?: string }).name;
      if (errorName === "ParameterNotFound") {
        // Already deleted, consider this a success
        this.cache.delete(path);
        return;
      }

      logger.error("Failed to delete parameter", { path });
      throw new Error(
        `Failed to delete credential from SSM: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Check if SSM is accessible
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to get a parameter to verify connectivity
      // Using a non-existent parameter will return ParameterNotFound which proves connectivity
      await this.client.send(
        new GetParameterCommand({
          Name: `${this.pathPrefix}/.healthcheck`,
          WithDecryption: false,
        }),
      );
      return true;
    } catch (error) {
      // ParameterNotFound is OK (proves connectivity)
      const errorName = (error as { name?: string }).name;
      if (errorName === "ParameterNotFound") {
        return true;
      }

      // Other errors mean SSM is not accessible
      logger.warn("SSM not accessible", { error: (error as Error).message });
      return false;
    }
  }

  /**
   * List all credential keys for a tenant
   * Uses GetParametersByPath for efficient listing
   */
  async listKeys(tenantId: string): Promise<string[]> {
    const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_.-]/g, "-");
    const tenantPath = `${this.pathPrefix}/${safeTenantId}`;

    try {
      const response = await this.client.send(
        new GetParametersByPathCommand({
          Path: tenantPath,
          Recursive: false,
          MaxResults: 50, // Reasonable limit
        }),
      );

      if (!response.Parameters) {
        return [];
      }

      // Extract just the key names (last component of path)
      return response.Parameters.map((param) =>
        param.Name?.split("/").pop(),
      ).filter((key): key is string => !!key);
    } catch (error) {
      const errorName = (error as { name?: string }).name;
      if (errorName === "ParameterNotFound") {
        return [];
      }
      logger.error("Failed to list keys for tenant", { tenantId });
      return [];
    }
  }
}
