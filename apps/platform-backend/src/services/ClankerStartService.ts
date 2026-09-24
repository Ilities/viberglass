import type { Clanker } from "@viberglass/types";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import type { ClankerProvisioner } from "../provisioning/ClankerProvisioner";
import { getClankerProvisioner } from "../provisioning/provisioningFactory";
import logger from "../config/logger";
import {
  CLANKER_SERVICE_ERROR_CODE,
  ClankerServiceError,
} from "./errors/ClankerServiceError";

type Clankers = Pick<ClankerDAO, "updateStatus" | "updateClanker">;
type Provisioner = Pick<ClankerProvisioner, "getProvisioningPreflightError" | "provision">;

export interface StartedClanker {
  /** The runner, now `deploying`. */
  clanker: Clanker;
  /** Settles when provisioning ends; never rejects (failures land on the runner's status). */
  provisioning: Promise<void>;
}

/**
 * Starts a runner: checks it can be provisioned, marks it deploying, then
 * provisions in the background, reporting progress as the status message so
 * the UI can follow it. The final status (active, failed, …) comes from the
 * provisioner, or the real error when provisioning throws.
 */
export class ClankerStartService {
  constructor(
    private readonly clankers: Clankers = new ClankerDAO(),
    private readonly provisioner: Provisioner = getClankerProvisioner(),
  ) {}

  async start(clanker: Clanker): Promise<StartedClanker> {
    if (clanker.status === "active") {
      throw new ClankerServiceError(CLANKER_SERVICE_ERROR_CODE.ALREADY_ACTIVE, "Clanker is already active");
    }
    if (clanker.status === "deploying") {
      throw new ClankerServiceError(CLANKER_SERVICE_ERROR_CODE.ALREADY_DEPLOYING, "Clanker is already deploying");
    }

    const preflightError = this.provisioner.getProvisioningPreflightError(clanker);
    if (preflightError) {
      throw new ClankerServiceError(CLANKER_SERVICE_ERROR_CODE.PROVISIONING_CONFIG_ERROR, preflightError);
    }

    const deploying = await this.clankers.updateStatus(clanker.id, "deploying", "Starting clanker...");
    return { clanker: deploying, provisioning: this.provision(deploying) };
  }

  private async provision(clanker: Clanker): Promise<void> {
    try {
      const provisioned = await this.provisioner.provision(clanker, (message) =>
        this.reportProgress(clanker.id, message),
      );
      await this.clankers.updateClanker(clanker.id, {
        deploymentConfig: provisioned.deploymentConfig ?? clanker.deploymentConfig ?? null,
        status: provisioned.status,
        statusMessage: provisioned.statusMessage ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provisioning failed";
      logger.error("Failed to provision clanker resources", { clankerId: clanker.id, error: message });
      await this.clankers.updateStatus(clanker.id, "failed", message).catch((statusError: unknown) => {
        logger.error("Failed to record the provisioning failure", {
          clankerId: clanker.id,
          error: statusError instanceof Error ? statusError.message : String(statusError),
        });
      });
    }
  }

  private async reportProgress(clankerId: string, statusMessage: string): Promise<void> {
    try {
      await this.clankers.updateStatus(clankerId, "deploying", statusMessage);
    } catch (error) {
      logger.warn("Failed to persist clanker provisioning progress", {
        clankerId,
        statusMessage,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
