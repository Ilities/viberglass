import { AppAccessDAO } from "../../persistence/apps/AppAccessDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { ProjectIntegrationLinkDAO } from "../../persistence/integrations/ProjectIntegrationLinkDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { InviteDAO } from "../../persistence/user/InviteDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { WorkspaceSettingsDAO } from "../../persistence/workspace/WorkspaceSettingsDAO";
import { InviteEmails } from "../people/InviteEmails";
import { InviteService } from "../people/InviteService";
import { createConnectionRepositoryCreator } from "../repositories/createConnectionRepositoryCreator";
import { SpaceAccessService } from "../spaces/SpaceAccessService";
import { AppAccessListService } from "./AppAccessListService";
import { AppDirectory } from "./AppDirectory";
import { AppOrigins } from "./AppOrigins";
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

export function createAppAccessListService(): AppAccessListService {
  return new AppAccessListService({
    spaces: new AppSpaceDAO(),
    accessList: new AppAccessDAO(),
    users: new UserDAO(),
    openInvites: new InviteDAO(),
    invites: new InviteService(),
    emails: new InviteEmails(),
  });
}

export function createAppDirectory(): AppDirectory {
  return new AppDirectory(new AppSpaceDAO(), new SpaceAccessService(), new AppAccessDAO(), new AppOrigins());
}
