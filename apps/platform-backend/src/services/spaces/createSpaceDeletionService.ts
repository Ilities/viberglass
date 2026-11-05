import { objectStorageBucket } from "@viberglass/types";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import { AppSettingDAO } from "../../persistence/apps/AppSettingDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { AppClaims } from "../apps/AppClaims";
import { AppSpaceTeardown } from "../apps/AppSpaceTeardown";
import { appHosting } from "../apps/createAppHosting";
import { createProjectRepositoryResolver } from "../repositories/createProjectRepositoryResolver";
import { SecretService } from "../SecretService";
import { S3SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";
import { SpaceDeletionService } from "./SpaceDeletionService";

export function createSpaceDeletionService(): SpaceDeletionService {
  const apps = new AppDAO();
  const teardown = new AppSpaceTeardown(
    apps,
    new AppClaims(apps, new AppPreviewDAO()),
    appHosting().host,
    new ProjectScmConfigDAO(),
    createProjectRepositoryResolver(),
    new AppSettingDAO(),
    new SecretService(),
  );
  return new SpaceDeletionService(new ProjectDAO(), teardown, new S3SpaceFilesStore(), () => objectStorageBucket(process.env));
}
