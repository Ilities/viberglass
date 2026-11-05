import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import { AppDataGrantDAO } from "../../persistence/apps/AppDataGrantDAO";
import { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import { AppSettingDAO } from "../../persistence/apps/AppSettingDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { SpaceBackingDAO } from "../../persistence/apps/SpaceBackingDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { ClawSchedulingEngine } from "../claw/ClawSchedulingEngine";
import { createProjectRepositoryResolver } from "../repositories/createProjectRepositoryResolver";
import { SecretService } from "../SecretService";
import { S3SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";
import { TaskTurnService } from "../taskTurns/TaskTurnService";
import { AppClaims } from "./AppClaims";
import { AppContractTask } from "./AppContractTask";
import { AppDataCopier } from "./AppDataCopier";
import { AppDataSeeder } from "./AppDataSeeder";
import { AppDataStore } from "./AppDataStore";
import { AppEjector } from "./AppEjector";
import { appRetentionLimits } from "./AppRetention";
import { appHosting } from "./createAppHosting";
import { createAppHomeService } from "./createAppSpaceServices";
import { SpaceBackingView } from "./SpaceBackingView";
import { SpaceBringIn } from "./SpaceBringIn";
import { sqliteFileProblem } from "./sqliteFileCheck";

export interface SpaceBackingServices {
  bringIn: SpaceBringIn;
  ejector: AppEjector;
  view: SpaceBackingView;
}

export function createSpaceBackingServices(): SpaceBackingServices {
  const projects = new ProjectDAO();
  const appHome = createAppHomeService();
  const backing = new SpaceBackingDAO();
  const apps = new AppDAO();
  const dataStore = new AppDataStore();
  return {
    bringIn: new SpaceBringIn({
      projects,
      appHome,
      scmConfigs: new ProjectScmConfigDAO(),
      repositories: createProjectRepositoryResolver(),
      backing,
      seeder: new AppDataSeeder(dataStore, sqliteFileProblem),
      contractTask: new AppContractTask(new TicketDAO(), new TaskTurnService()),
    }),
    ejector: new AppEjector({
      spaces: new AppSpaceDAO(),
      claims: new AppClaims(apps, new AppPreviewDAO()),
      apps,
      host: appHosting().host,
      data: dataStore,
      backups: new AppDataBackupDAO(),
      copier: new AppDataCopier(),
      settings: new AppSettingDAO(),
      secrets: new SecretService(),
      grants: new AppDataGrantDAO(),
      backing,
      refreshSchedules: () => ClawSchedulingEngine.getInstance().triggerRefresh(),
    }),
    view: new SpaceBackingView(projects, appHome, backing, new S3SpaceFilesStore(), appRetentionLimits().backupDays),
  };
}
