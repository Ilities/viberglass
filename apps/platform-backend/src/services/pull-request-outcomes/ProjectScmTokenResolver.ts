import type { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type { SecretResolutionService } from "../SecretResolutionService";

/**
 * The token a project's SCM connection holds: the credential the project
 * selected, else the connection's default. Null when there is no token
 * credential to read with.
 */
export class ProjectScmTokenResolver {
  constructor(
    private readonly scmConfigs: Pick<ProjectScmConfigDAO, "getByProjectId">,
    private readonly credentials: Pick<IntegrationCredentialDAO, "getById" | "getDefaultForIntegration">,
    private readonly secrets: Pick<SecretResolutionService, "resolveSecretValue">,
  ) {}

  async resolve(projectId: string): Promise<string | null> {
    const scmConfig = await this.scmConfigs.getByProjectId(projectId);
    if (!scmConfig) return null;

    const credential = scmConfig.integrationCredentialId
      ? await this.credentials.getById(scmConfig.integrationCredentialId)
      : await this.credentials.getDefaultForIntegration(scmConfig.integrationId);
    if (!credential || credential.credentialType !== "token") return null;

    const value = await this.secrets.resolveSecretValue(credential.secretId);
    return value?.trim() ? value : null;
  }
}
