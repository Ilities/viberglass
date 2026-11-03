import { integrationRegistry } from "../../integrations/registerIntegrationPlugins";
import { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import { IntegrationDAO } from "../../persistence/integrations/IntegrationDAO";
import { SecretResolutionService } from "../SecretResolutionService";
import { ConnectionRepositoryCreator } from "./ConnectionRepositoryCreator";

export function createConnectionRepositoryCreator(): ConnectionRepositoryCreator {
  return new ConnectionRepositoryCreator(
    new IntegrationDAO(),
    new IntegrationCredentialDAO(),
    new SecretResolutionService(),
    integrationRegistry,
  );
}
