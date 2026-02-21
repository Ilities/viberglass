import type { Clanker } from "@viberglass/types";
import type { ClankerProvisioner } from "./ClankerProvisioner";
import type { ProvisioningStrategyHandler } from "./ProvisioningStrategyHandler";
import {
  ProvisioningStrategyResolver,
  type StrategyResolution,
} from "./ProvisioningStrategyResolver";
import type {
  AvailabilityResult,
  ProvisioningProgressReporter,
  ProvisioningResult,
  ProvisioningStrategyName,
} from "./types";

export class ClankerProvisioningOrchestrator implements ClankerProvisioner {
  constructor(
    private readonly resolver: ProvisioningStrategyResolver,
    private readonly handlers: Record<ProvisioningStrategyName, ProvisioningStrategyHandler>,
  ) {}

  getProvisioningPreflightError(clanker: Clanker): string | null {
    const strategyResolution = this.resolveStrategy(clanker);
    if (strategyResolution.kind !== "resolved") {
      return strategyResolution.message;
    }

    return this.handlers[strategyResolution.strategy].getPreflightError(clanker);
  }

  async provision(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult> {
    const strategyResolution = this.resolveStrategy(clanker);
    if (strategyResolution.kind !== "resolved") {
      return {
        status: "inactive",
        statusMessage: strategyResolution.message,
      };
    }

    return this.handlers[strategyResolution.strategy].provision(clanker, progress);
  }

  async resolveAvailabilityStatus(clanker: Clanker): Promise<AvailabilityResult> {
    const strategyResolution = this.resolveStrategy(clanker);
    if (strategyResolution.kind !== "resolved") {
      return {
        status: "inactive",
        statusMessage: strategyResolution.message,
      };
    }

    return this.handlers[strategyResolution.strategy].checkAvailability(clanker);
  }

  private resolveStrategy(clanker: Clanker): StrategyResolution {
    return this.resolver.resolve(clanker.deploymentStrategy?.name);
  }
}
