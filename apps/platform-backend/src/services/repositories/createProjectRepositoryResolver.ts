import { integrationRegistry } from "../../integrations/registerIntegrationPlugins";
import { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { SecretResolutionService } from "../SecretResolutionService";
import { ProjectRepositoryResolver } from "./ProjectRepositoryResolver";

export function createProjectRepositoryResolver(): ProjectRepositoryResolver {
  return new ProjectRepositoryResolver(
    new ProjectScmConfigDAO(),
    new IntegrationCredentialDAO(),
    new SecretResolutionService(),
    integrationRegistry,
  );
}
