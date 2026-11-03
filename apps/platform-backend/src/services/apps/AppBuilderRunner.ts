import type { Clanker, ClankerConfigV1 } from "@viberglass/types";
import { DEFAULT_AGENT_TYPE } from "@viberglass/types";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { DeploymentStrategyDAO } from "../../persistence/clanker/DeploymentStrategyDAO";
import { PlatformRunnerDAO } from "../../persistence/clanker/PlatformRunnerDAO";
import { resolveClankerConfig } from "../../clanker-config";
import { defaultDeploymentStrategyName } from "../../provisioning/shared/deploymentStrategies";
import { ClankerStartService } from "../ClankerStartService";
import { appBuilderImage } from "./appBuilderImage";

type StrategyName = ReturnType<typeof defaultDeploymentStrategyName>;

/** The builder isn't running yet, or couldn't start; the build waits for the next try. */
export class AppBuilderUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppBuilderUnavailable";
  }
}

/**
 * The runner release builds run on. The platform creates it on the first build,
 * where this installation's workers run, and starts it whenever it isn't running
 * or no longer runs the configured image.
 */
export class AppBuilderRunner {
  constructor(
    private readonly platformRunners: Pick<PlatformRunnerDAO, "findId" | "create"> = new PlatformRunnerDAO(),
    private readonly runners: Pick<ClankerDAO, "getClanker" | "updateClanker"> = new ClankerDAO(),
    private readonly strategies: Pick<DeploymentStrategyDAO, "getDeploymentStrategyByName"> = new DeploymentStrategyDAO(),
    private readonly starter: Pick<ClankerStartService, "start"> = new ClankerStartService(),
    private readonly strategyName: () => StrategyName = defaultDeploymentStrategyName,
  ) {}

  async ready(): Promise<Clanker> {
    const name = this.strategyName();
    const wanted = builderConfig(name);
    const id = (await this.platformRunners.findId("app_builder")) ?? (await this.create(name, wanted));
    let runner = await this.runners.getClanker(id);
    if (!runner) throw new AppBuilderUnavailable("The app builder runner disappeared");
    if (runner.status === "deploying") throw new AppBuilderUnavailable("The app builder is starting");
    if (!runsAs(runner, wanted)) runner = await this.reconfigure(runner, name, wanted);
    if (runner.status === "active") return runner;

    const { provisioning } = await this.starter.start(runner);
    await provisioning;
    const started = await this.runners.getClanker(id);
    if (started?.status !== "active") {
      throw new AppBuilderUnavailable(`The app builder couldn't start: ${started?.statusMessage ?? "unknown reason"}`);
    }
    return started;
  }

  /** The installation's settings changed since the builder was set up; it starts again with the new ones. */
  private async reconfigure(runner: Clanker, name: StrategyName, wanted: ClankerConfigV1): Promise<Clanker> {
    return this.runners.updateClanker(runner.id, {
      deploymentStrategyId: await this.strategyId(name),
      deploymentConfig: { ...wanted },
      status: "inactive",
      statusMessage: null,
    });
  }

  private async create(name: StrategyName, deploymentConfig: ClankerConfigV1): Promise<string> {
    return this.platformRunners.create("app_builder", {
      name: "App builder",
      slug: "viberglass-app-builder",
      deploymentStrategyId: await this.strategyId(name),
      deploymentConfig: { ...deploymentConfig },
    });
  }

  private async strategyId(name: StrategyName): Promise<string> {
    const strategy = await this.strategies.getDeploymentStrategyByName(name);
    if (!strategy) throw new AppBuilderUnavailable(`No ${name} deployment strategy to run the app builder on`);
    return strategy.id;
  }
}

function builderConfig(name: StrategyName): ClankerConfigV1 {
  const containerImage = appBuilderImage(name);
  return {
    version: 1,
    // ECS registers a task definition for the image; Docker and Kubernetes use it as it is.
    strategy: name === "ecs"
      ? { type: "ecs", provisioningMode: "managed", containerImage }
      : { type: name, provisioningMode: "prebuilt", containerImage },
    agent: { type: DEFAULT_AGENT_TYPE },
  };
}

function runsAs(runner: Clanker, wanted: ClankerConfigV1): boolean {
  const strategy = resolveClankerConfig(runner).config.strategy;
  return strategy.type === wanted.strategy.type && "containerImage" in strategy && "containerImage" in wanted.strategy
    && strategy.containerImage === wanted.strategy.containerImage;
}
