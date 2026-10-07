import type { AuthCredentialType, AuthCredentials, Integration } from "@viberglass/types";
import { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import { SecretResolutionService } from "../SecretResolutionService";
import { SecretService } from "../SecretService";

/**
 * A connection's settings with its token filled in, as its plugin expects
 * them: the connection's default token credential, else the secret its
 * settings name.
 */
export class ConnectionCredentialsResolver {
  constructor(
    private readonly credentials: Pick<IntegrationCredentialDAO, "getDefaultForIntegration"> = new IntegrationCredentialDAO(),
    private readonly secretValues: Pick<SecretResolutionService, "resolveSecretValue"> = new SecretResolutionService(),
    private readonly namedSecrets: Pick<SecretService, "resolveSecretValueByName"> = new SecretService(),
  ) {}

  async resolve(integration: Pick<Integration, "id" | "config">): Promise<AuthCredentials & Record<string, unknown>> {
    const config = integration.config;
    const type = typeof config.authType === "string" ? config.authType : "token";
    const resolved: AuthCredentials & Record<string, unknown> = { ...config, type: isAuthType(type) ? type : "token" };
    const token = (await this.defaultToken(integration.id)) ?? (await this.namedToken(config.secretName));
    if (token) resolved.token = token;
    return resolved;
  }

  private async defaultToken(integrationId: string): Promise<string | null> {
    const credential = await this.credentials.getDefaultForIntegration(integrationId);
    if (!credential || credential.credentialType !== "token") return null;
    const value = await this.secretValues.resolveSecretValue(credential.secretId);
    return value?.trim() ? value : null;
  }

  private async namedToken(secretName: unknown): Promise<string | null> {
    if (typeof secretName !== "string" || !secretName) return null;
    const value = await this.namedSecrets.resolveSecretValueByName(secretName).catch(() => null);
    return value?.trim() ? value : null;
  }
}

const AUTH_TYPES: readonly string[] = ["api_key", "oauth", "basic", "token"] satisfies AuthCredentialType[];

function isAuthType(value: string): value is AuthCredentialType {
  return AUTH_TYPES.includes(value);
}
