import { createChildLogger } from "../../config/logger";
import type { AppDataGrantDAO } from "../../persistence/apps/AppDataGrantDAO";
import type { AppDataCopier } from "./AppDataCopier";

const logger = createChildLogger({ service: "AppDataGrantSweep" });

const KEPT_AT_MOST_MS = 24 * 60 * 60 * 1000;

/** Deletes each copy of an app's data once the turn that took it has ended, and any copy a day old. */
export class AppDataGrantSweep {
  constructor(
    private readonly grants: Pick<AppDataGrantDAO, "listDone" | "markRemoved">,
    private readonly copier: Pick<AppDataCopier, "remove">,
  ) {}

  async sweep(now: Date): Promise<number> {
    let removed = 0;
    for (const grant of await this.grants.listDone(new Date(now.getTime() - KEPT_AT_MOST_MS))) {
      try {
        await this.copier.remove(grant.objectKey);
        await this.grants.markRemoved(grant.id);
        removed++;
      } catch (error) {
        logger.warn("Couldn't delete a copy of an app's data; trying again on the next sweep", {
          grantId: grant.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return removed;
  }
}
