import type { Clanker } from "@viberglass/types";
import { getClankerProvisioner } from "../provisioning/provisioningFactory";
import type {
  AvailabilityResult,
  ProvisioningProgressReporter,
  ProvisioningResult,
} from "../provisioning/types";

export class ClankerProvisioningService {
  private readonly provisioner = getClankerProvisioner();

  getProvisioningPreflightError(clanker: Clanker): string | null {
    return this.provisioner.getProvisioningPreflightError(clanker);
  }

  provisionClanker(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult> {
    return this.provisioner.provision(clanker, progress);
  }

  resolveAvailabilityStatus(clanker: Clanker): Promise<AvailabilityResult> {
    return this.provisioner.resolveAvailabilityStatus(clanker);
  }
}
