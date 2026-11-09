import express from "express";
import { toAgentDirectoryEntry } from "@viberglass/types";
import type { ClankerListing } from "../../services/ClankerListing";

const LIMIT = 100;

/** GET /: the workspace's agents for those who see runs, without their configuration. */
export function createAgentDirectoryRouter(listing: Pick<ClankerListing, "list">) {
  const router = express.Router();
  router.get("/", async (_req, res, next) => {
    try {
      res.json({ success: true, data: (await listing.list(LIMIT, 0)).map(toAgentDirectoryEntry) });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
