import type { Clanker } from "@viberglass/types";
import type {
  AvailabilityResult,
  ProvisioningProgressReporter,
  ProvisioningResult,
} from "./types";

export interface ClankerProvisioner {
  getProvisioningPreflightError(clanker: Clanker): string | null;
  provision(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult>;
  deprovision(clanker: Clanker): Promise<ProvisioningResult>;
  resolveAvailabilityStatus(clanker: Clanker): Promise<AvailabilityResult>;
}
