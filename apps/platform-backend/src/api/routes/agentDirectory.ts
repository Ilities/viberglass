import express from "express";
import { toAgentDirectoryEntry, type AgentDirectoryEntry, type Clanker } from "@viberglass/types";
import type { ClankerListing } from "../../services/ClankerListing";

const LIMIT = 100;

/** A demo instance's runners have no model key or compute, so whether one could run says nothing there. */
function withoutRunnerState(clanker: Clanker): AgentDirectoryEntry {
  const { id, name, slug, agent, model } = toAgentDirectoryEntry(clanker);
  return { id, name, slug, agent, model };
}

/** GET /: the workspace's agents for those who see runs, without their configuration. */
export function createAgentDirectoryRouter(listing: Pick<ClankerListing, "list">, demoInstance: boolean) {
  const toEntry = demoInstance ? withoutRunnerState : toAgentDirectoryEntry;
  const router = express.Router();
  router.get("/", async (_req, res, next) => {
    try {
      res.json({ success: true, data: (await listing.list(LIMIT, 0)).map(toEntry) });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
