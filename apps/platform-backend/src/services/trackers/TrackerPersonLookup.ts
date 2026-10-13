import type { TrackerPerson } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import { TrackerCommenterResolver } from "./TrackerCommenterResolver";

const logger = createChildLogger({ service: "TrackerPersonLookup" });

/**
 * Fills in a person an event names only by the tracker's id for them, asking
 * the tracker through the connection. Keeps the event's version when the
 * tracker can't look people up or the lookup fails.
 */
export class TrackerPersonLookup {
  constructor(private readonly commenters: Pick<TrackerCommenterResolver, "resolve"> = new TrackerCommenterResolver()) {}

  async complete(integrationId: string, person: TrackerPerson): Promise<TrackerPerson> {
    const accountId = person.accountId;
    if (person.email || !accountId) return person;
    try {
      const commenter = await this.commenters.resolve({ integrationId });
      return (await commenter?.findPerson?.(accountId)) ?? person;
    } catch (error) {
      logger.warn("Couldn't look up a tracker person", { integrationId, reason: error instanceof Error ? error.message : String(error) });
      return person;
    }
  }
}
