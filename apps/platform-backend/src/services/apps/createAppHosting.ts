import type { AppHost } from "@viberglass/types";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { defaultDeploymentStrategyName } from "../../provisioning/shared/deploymentStrategies";
import { AppDataStore } from "./AppDataStore";
import { AppHostRegistry } from "./AppHostRegistry";
import { AppOrigins } from "./AppOrigins";
import { dockerAppHostOptions } from "./appHostingConfig";
import { AppInstanceRunner } from "./AppInstanceRunner";
import { AppInstanceSpecs } from "./AppInstanceSpecs";
import { AppPreviewReconciler } from "./AppPreviewReconciler";
import { AppPreviewService } from "./AppPreviewService";
import { AppPreviewSweep } from "./AppPreviewSweep";
import { AppReconciler } from "./AppReconciler";
import { AppReleaseSwitch } from "./AppReleaseSwitch";
import { AppService } from "./AppService";
import { AppSweep } from "./AppSweep";
import { DockerAppHost } from "./DockerAppHost";
import { ReleaseBuildService } from "./ReleaseBuildService";
import { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import { StsAppDataCredentials } from "./StsAppDataCredentials";

export interface AppHosting {
  service: AppService;
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
  const registry = new AppHostRegistry([new DockerAppHost(dockerAppHostOptions(process.env))]);
  const host = () => registry.get(defaultDeploymentStrategyName());
  const runner = new AppInstanceRunner(new AppInstanceSpecs(new StsAppDataCredentials()));
  const switcher = new AppReleaseSwitch(apps, releases, new AppDataBackupDAO(), new AppDataStore(), runner);
  const reconciler = new AppReconciler(apps, releases, host, runner, switcher);
  const previews = new AppPreviewDAO();
  const previewReconciler = new AppPreviewReconciler(previews, releases, host, runner);
  const origins = new AppOrigins();
  hosting = {
    service: new AppService(spaces, apps, releases, reconciler, host, origins),
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
