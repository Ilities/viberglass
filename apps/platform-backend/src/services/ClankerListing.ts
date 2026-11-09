import type { Clanker } from "@viberglass/types";
import type { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import type { ClankerProvisioner } from "../provisioning/ClankerProvisioner";
import type { ClankerReadinessService } from "./ClankerReadinessService";
import { nextClankerStatus } from "./clankerStatusTransition";

/** Runners as they are now: their status checked against their compute, and whether they can take a task. */
export class ClankerListing {
  constructor(
    private readonly clankers: Pick<ClankerDAO, "listClankers" | "updateStatus">,
    private readonly provisioning: Pick<ClankerProvisioner, "resolveAvailabilityStatus">,
    private readonly readiness: Pick<ClankerReadinessService, "withReadiness" | "one">,
  ) {}

  async list(limit: number, offset: number): Promise<Clanker[]> {
    const clankers = await this.clankers.listClankers(limit, offset);
    return this.readiness.withReadiness(await Promise.all(clankers.map((clanker) => this.refreshStatus(clanker))));
  }

  async current(clanker: Clanker): Promise<Clanker> {
    return this.readiness.one(await this.refreshStatus(clanker));
  }

  /** A deploying runner is left alone until provisioning finishes. */
  async refreshStatus(clanker: Clanker): Promise<Clanker> {
    if (clanker.status === "deploying") return clanker;
    const availability = await this.provisioning.resolveAvailabilityStatus(clanker);
    const next = nextClankerStatus(
      { status: clanker.status, statusMessage: clanker.statusMessage ?? null },
      { status: availability.status, statusMessage: availability.statusMessage ?? null },
    );
    if (!next) return clanker;
    return this.clankers.updateStatus(clanker.id, next.status, next.statusMessage);
  }
}
