import type { RepositoryHost } from "@viberglass/integration-core";
import type { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type { SecretResolutionService } from "../SecretResolutionService";
import type { CodeHosts } from "./codeHosts";

/** A space's code host and the token its connection holds, or why it can't be used. */
export type ProjectRepository = { host: RepositoryHost; token: string } | { unavailable: string };

/**
 * The code host of a space's repository connection, with the credential the
 * space selected, else the connection's default.
 */
export class ProjectRepositoryResolver {
  constructor(
    private readonly scmConfigs: Pick<ProjectScmConfigDAO, "getByProjectId">,
    private readonly credentials: Pick<IntegrationCredentialDAO, "getById" | "getDefaultForIntegration">,
    private readonly secrets: Pick<SecretResolutionService, "resolveSecretValue">,
    private readonly plugins: CodeHosts,
  ) {}

  async resolve(projectId: string): Promise<ProjectRepository> {
    const scmConfig = await this.scmConfigs.getByProjectId(projectId);
    if (!scmConfig) return { unavailable: "The space has no repository" };

    const host = scmConfig.integrationSystem ? this.plugins.get(scmConfig.integrationSystem)?.repository : undefined;
    if (!host) return { unavailable: "The space's code host can't read pull requests" };

    const credential = scmConfig.integrationCredentialId
      ? await this.credentials.getById(scmConfig.integrationCredentialId)
      : await this.credentials.getDefaultForIntegration(scmConfig.integrationId);
    if (!credential || credential.credentialType !== "token") {
      return { unavailable: "The space's repository connection has no token" };
    }

    const token = await this.secrets.resolveSecretValue(credential.secretId);
    return token?.trim() ? { host, token } : { unavailable: "The space's repository connection has no token" };
  }
}
