import express from "express";
import { OUTPUT_KINDS, type OutputKind, type OutputProducer, type OutputsQuery } from "@viberglass/types";
import { requireAuth } from "../middleware/authentication";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";
import { OutputsService } from "../../services/outputs/OutputsService";

const SEARCH_CHARS = 100;

function isKind(value: unknown): value is OutputKind {
  return OUTPUT_KINDS.some((kind) => kind === value);
}

function isProducer(value: unknown): value is OutputProducer {
  return value === "agent" || value === "person";
}

/** The query string as Outputs filters, ignoring values it doesn't know. */
export function outputsQueryOf(query: express.Request["query"]): OutputsQuery {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  return {
    kind: isKind(query.kind) ? query.kind : undefined,
    spaceId: text(query.spaceId),
    producer: isProducer(query.producer) ? query.producer : undefined,
    q: text(query.q)?.slice(0, SEARCH_CHARS),
    latest: query.latest === "true",
    cursor: text(query.cursor),
  };
}

/** Outputs: what was made across the spaces the signed-in person sees. */
export function createOutputsRouter(outputs: Pick<OutputsService, "page" | "summary"> = new OutputsService()) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", async (req, res, next) => {
    try {
      res.json({ success: true, data: await outputs.page(spaceViewerOf(req)!, outputsQueryOf(req.query)) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/summary", async (req, res, next) => {
    try {
      res.json({ success: true, data: await outputs.summary(spaceViewerOf(req)!, outputsQueryOf(req.query)) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createOutputsRouter();
