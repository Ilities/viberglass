import { ProjectIntegrationLinkDAO } from "../../persistence/integrations/ProjectIntegrationLinkDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { WorkspaceSettingsDAO } from "../../persistence/workspace/WorkspaceSettingsDAO";
import { createConnectionRepositoryCreator } from "../repositories/createConnectionRepositoryCreator";
import { AppHomeService } from "./AppHomeService";
import { AppSpaceCreator } from "./AppSpaceCreator";

export function createAppHomeService(): AppHomeService {
  return new AppHomeService(new WorkspaceSettingsDAO(), createConnectionRepositoryCreator());
}

export function createAppSpaceCreator(appHome: AppHomeService = createAppHomeService()): AppSpaceCreator {
  return new AppSpaceCreator({
    appHome,
    projects: new ProjectDAO(),
    links: new ProjectIntegrationLinkDAO(),
    scmConfigs: new ProjectScmConfigDAO(),
    creator: createConnectionRepositoryCreator(),
  });
}
