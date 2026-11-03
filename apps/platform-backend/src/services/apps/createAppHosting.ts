import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { defaultDeploymentStrategyName } from "../../provisioning/shared/deploymentStrategies";
import { AppDataStore } from "./AppDataStore";
import { AppHostRegistry } from "./AppHostRegistry";
import { dockerAppHostOptions } from "./appHostingConfig";
import { AppInstanceRunner } from "./AppInstanceRunner";
import { AppInstanceSpecs } from "./AppInstanceSpecs";
import { AppReconciler } from "./AppReconciler";
import { AppReleaseSwitch } from "./AppReleaseSwitch";
import { AppService } from "./AppService";
import { AppSweep } from "./AppSweep";
import { DockerAppHost } from "./DockerAppHost";
import { StsAppDataCredentials } from "./StsAppDataCredentials";

export interface AppHosting {
  service: AppService;
  sweep: AppSweep;
}

let hosting: AppHosting | null = null;

/** One per process, so the page and the sweep share who's starting or stopping what. */
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
  hosting = {
    service: new AppService(spaces, apps, releases, reconciler, host),
    sweep: new AppSweep(spaces, apps, releases, reconciler),
  };
  return hosting;
}
