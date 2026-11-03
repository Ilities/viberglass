import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { createProjectRepositoryResolver } from "../repositories/createProjectRepositoryResolver";
import { AppReleasePoller } from "./AppReleasePoller";
import { ReleaseBuildService } from "./ReleaseBuildService";

export function createAppReleasePoller(): AppReleasePoller {
  const releases = new AppReleaseDAO();
  return new AppReleasePoller(
    new AppSpaceDAO(),
    new ProjectScmConfigDAO(),
    createProjectRepositoryResolver(),
    releases,
    new ReleaseBuildService(releases),
  );
}
