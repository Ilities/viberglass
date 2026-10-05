import express, { Request, Response } from "express";
import Joi from "joi";
import { RunManifestExportDAO } from "../../persistence/job/RunManifestExportDAO";
import { RunManifestExportService } from "../../services/RunManifestExportService";
import { RunRecordDAO } from "../../persistence/job/RunRecordDAO";
import {
  InvalidRunRecordCursorError,
  RunRecordService,
} from "../../services/runRecords/RunRecordService";
import { createChildLogger } from "../../config/logger";

const logger = createChildLogger({ route: "runManifests" });
const router = express.Router();
const exportService = new RunManifestExportService(new RunManifestExportDAO());
const recordService = new RunRecordService(new RunRecordDAO());

const listQuerySchema = Joi.object({
  cursor: Joi.string().max(500),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

const exportQuerySchema = Joi.object({
  since: Joi.date().iso(),
  until: Joi.date().iso(),
  includeLogs: Joi.boolean().default(false),
});

/**
 * GET /export — every run manifest dispatched in [since, until), as NDJSON.
 *
 * One line per job: `{ manifest, pullRequestOutcome, logs? }`. This is the
 * eval corpus in its raw form, so it is streamed rather than paginated.
 */
router.get("/export", async (req: Request, res: Response) => {
  const { error, value } = exportQuerySchema.validate(req.query);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(200).type("application/x-ndjson");
  try {
    for await (const record of exportService.records(value)) {
      if (!res.write(`${JSON.stringify(record)}\n`)) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (exportError) {
    // Headers are already sent, so the client sees a truncated stream.
    logger.error("Run manifest export failed", { error: exportError });
    res.destroy(exportError instanceof Error ? exportError : undefined);
  }
});

/** GET / — run records, newest first, as `{ records, nextCursor }`. */
router.get("/", async (req: Request, res: Response) => {
  const { error, value } = listQuerySchema.validate(req.query);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    return res.json(await recordService.list(value.cursor, value.limit));
  } catch (listError) {
    if (listError instanceof InvalidRunRecordCursorError) {
      return res.status(400).json({ error: listError.message });
    }
    logger.error("Failed to list run records", { error: listError });
    return res.status(500).json({ error: "Failed to list run records" });
  }
});

export default router;
