import { IntegrationCredentialDAO } from '../../persistence/integrations/IntegrationCredentialDAO';
import { SecretResolutionService } from '../../services/SecretResolutionService';

/** The token a connection already holds, as its default token credential. */
export interface IntegrationTokenSource {
  resolveDefaultToken(integrationId: string): Promise<string | null>;
}

export class IntegrationCredentialTokenSource implements IntegrationTokenSource {
  constructor(
    private readonly credentials: Pick<IntegrationCredentialDAO, 'getDefaultForIntegration'> = new IntegrationCredentialDAO(),
    private readonly secrets: Pick<SecretResolutionService, 'resolveSecretsForClanker'> = new SecretResolutionService(),
  ) {}

  async resolveDefaultToken(integrationId: string): Promise<string | null> {
    const credential = await this.credentials.getDefaultForIntegration(integrationId);
    if (!credential || credential.credentialType !== 'token') return null;

    const values = Object.values(await this.secrets.resolveSecretsForClanker([credential.secretId]));
    return values[0]?.trim() ? values[0] : null;
  }
}
