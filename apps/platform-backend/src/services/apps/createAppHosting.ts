import type { AppHost } from "@viberglass/types";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import { AppDataOrderDAO } from "../../persistence/apps/AppDataOrderDAO";
import { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import { TaskRefsDAO } from "../../persistence/ticketing/TaskRefsDAO";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { AppReleaseRollbackDAO } from "../../persistence/apps/AppReleaseRollbackDAO";
import { AppSettingDAO } from "../../persistence/apps/AppSettingDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { defaultDeploymentStrategyName } from "../../provisioning/shared/deploymentStrategies";
import { ClawAppRestoreCompletion } from "../claw/ClawAppRestoreCompletion";
import { AppBackupService } from "./AppBackupService";
import { AppDataMaintenance } from "./AppDataMaintenance";
import { AppDataStore } from "./AppDataStore";
import { AppFinalBackup } from "./AppFinalBackup";
import { AppHostRegistry } from "./AppHostRegistry";
import { AppOrigins } from "./AppOrigins";
import { dockerAppHostOptions, ecsAppHostOptions, kubernetesAppHostOptions } from "./appHostingConfig";
import { AppInstanceRunner } from "./AppInstanceRunner";
import { AppInstanceSpecs } from "./AppInstanceSpecs";
import { AppPreviewReconciler } from "./AppPreviewReconciler";
import { AppPreviewService } from "./AppPreviewService";
import { AppPreviewSweep } from "./AppPreviewSweep";
import { AppReconciler } from "./AppReconciler";
import { AppReleaseSwitch } from "./AppReleaseSwitch";
import { AppRollbackService } from "./AppRollbackService";
import { AppRollbackSettler } from "./AppRollbackSettler";
import { AppService } from "./AppService";
import { AppSettingsEnv } from "./AppSettingsEnv";
import { AppSettingsService } from "./AppSettingsService";
import { appSettingSecretStorage } from "./appSettingSecretStorage";
import { AppSweep } from "./AppSweep";
import { DockerAppHost } from "./DockerAppHost";
import { EcsAppHost } from "./EcsAppHost";
import { KubernetesAppHost } from "./KubernetesAppHost";
import { ReleaseBuildService } from "./ReleaseBuildService";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import { StsAppDataCredentials } from "./StsAppDataCredentials";
import { SecretService } from "../SecretService";

export interface AppHosting {
  service: AppService;
  rollbacks: AppRollbackService;
  backups: AppBackupService;
  settings: AppSettingsService;
  sweep: AppSweep;
  previews: AppPreviewService;
  previewSweep: AppPreviewSweep;
  /** Where apps run on this deployment; null when nothing hosts apps here. */
  host: () => AppHost | null;
}

let hosting: AppHosting | null = null;

/** One per process, so the pages and the sweeps share who's starting or stopping what. */
export function appHosting(): AppHosting {
  if (hosting) return hosting;
  const apps = new AppDAO();
  const releases = new AppReleaseDAO();
  const spaces = new AppSpaceDAO();
  const kubernetes = kubernetesAppHostOptions(process.env);
  const ecs = ecsAppHostOptions(process.env);
  const registry = new AppHostRegistry([
    new DockerAppHost(dockerAppHostOptions(process.env)),
    ...(kubernetes ? [new KubernetesAppHost(kubernetes)] : []),
    ...(ecs ? [new EcsAppHost(ecs)] : []),
  ]);
  const host = () => registry.get(defaultDeploymentStrategyName());
  const settings = new AppSettingDAO();
  const secrets = new SecretService();
  const runner = new AppInstanceRunner(new AppInstanceSpecs(new StsAppDataCredentials(), new AppSettingsEnv(settings, secrets)), apps);
  const backups = new AppDataBackupDAO();
  const dataStore = new AppDataStore();
  const switcher = new AppReleaseSwitch(apps, releases, backups, dataStore, runner);
  const settler = new AppRollbackSettler(new AppReleaseRollbackDAO(), apps, new UserDAO(), new TaskActivityRecorder());
  const orders = new AppDataOrderDAO();
  const dataWork = new AppDataMaintenance(apps, orders, releases, backups, dataStore, runner, new ClawAppRestoreCompletion());
  const reconciler = new AppReconciler(apps, releases, host, runner, switcher, settler, new AppFinalBackup(dataStore, backups, apps), dataWork);
  const previews = new AppPreviewDAO();
  const previewReconciler = new AppPreviewReconciler(previews, releases, host, runner);
  const origins = new AppOrigins();
  hosting = {
    service: new AppService(spaces, apps, releases, backups, reconciler, host, origins, previews, new TaskRefsDAO()),
    rollbacks: new AppRollbackService(spaces, apps, releases, backups, reconciler),
    backups: new AppBackupService(spaces, apps, backups, orders, reconciler),
    settings: new AppSettingsService(spaces, settings, secrets, releases, apps, reconciler, (projectId, name) =>
      appSettingSecretStorage(host()?.target ?? null, projectId, name),
    ),
    sweep: new AppSweep(spaces, apps, releases, reconciler, host),
    previews: new AppPreviewService({
      policy: new TaskAskPolicyService(),
      owners: new SpaceOwnershipDAO(),
      tickets: new TicketDAO(),
      pullRequests: new TaskPullRequestDAO(),
      scmConfigs: new ProjectScmConfigDAO(),
      releases,
      builds: new ReleaseBuildService(releases),
      previews,
      reconciler: previewReconciler,
      origins,
    }),
    previewSweep: new AppPreviewSweep(previews, previewReconciler),
    host,
  };
  return hosting;
}
