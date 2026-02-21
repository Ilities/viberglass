import type { Clanker } from "@viberglass/types";
import type {
  AvailabilityResult,
  ProvisioningProgressReporter,
  ProvisioningResult,
} from "./types";

export interface ProvisioningStrategyHandler {
  getPreflightError(clanker: Clanker): string | null;
  provision(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult>;
  checkAvailability(clanker: Clanker): Promise<AvailabilityResult>;
}
