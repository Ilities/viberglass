import type { CredentialRequest, SecretBinding } from "@viberglass/types";
import { SecretDAO } from "../persistence/secret/SecretDAO";
import { SecretService } from "./SecretService";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ service: "SecretResolutionService" });

export class SecretResolutionService {
  constructor(
    private readonly secretService: Pick<SecretService, "resolveSecretValues"> = new SecretService(),
    private readonly secretDAO: Pick<SecretDAO, "getSecretsByIds"> = new SecretDAO(),
  ) {}

  /**
   * Env var → value for workers that receive credentials in their environment (Docker).
   * A secret that can't be resolved is left out with a warning, so the run fails on
   * the missing credential rather than on an unrelated one.
   */
  async resolveBindings(bindings: SecretBinding[]): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    for (const binding of bindings) {
      const value = await this.resolveSecretValue(binding.secretId);
      if (value === null) {
        logger.warn("Secret value not found for binding", { envVar: binding.envVar, secretId: binding.secretId });
        continue;
      }
      resolved[binding.envVar] = value;
    }
    return resolved;
  }

  /** One secret's value, or null when it is missing or can't be read. */
  async resolveSecretValue(secretId: string): Promise<string | null> {
    try {
      return (await this.secretService.resolveSecretValues([secretId])).get(secretId) ?? null;
    } catch (error) {
      logger.warn("Failed to resolve secret", { secretId, error: (error as Error).message });
      return null;
    }
  }

  /**
   * What a worker loads for these bindings: the env var, and for SSM secrets the
   * parameter ECS and Lambda workers read. Bindings to deleted secrets are left out.
   */
  async getCredentialRequests(bindings: SecretBinding[]): Promise<CredentialRequest[]> {
    const secrets = await this.secretDAO.getSecretsByIds(bindings.map((binding) => binding.secretId));
    const secretsById = new Map(secrets.map((secret) => [secret.id, secret]));
    return bindings.flatMap((binding) => {
      const secret = secretsById.get(binding.secretId);
      if (!secret) return [];
      return [{ envVar: binding.envVar, ssmPath: secret.secretLocation === "ssm" ? secret.secretPath : null }];
    });
  }
}
