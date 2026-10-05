import { SecretResolutionService } from "../../../services/SecretResolutionService";
import { WorkerBootstrapCredentials } from "../../../services/job/WorkerBootstrapCredentials";
import { Request, Response, Router } from "express";
import logger from "../../../config/logger";
import { AgentPendingRequestDAO } from "../../../persistence/agentSession/AgentPendingRequestDAO";
import { AgentSessionDAO } from "../../../persistence/agentSession/AgentSessionDAO";
import { AgentSessionEventDAO } from "../../../persistence/agentSession/AgentSessionEventDAO";
import { AgentTurnDAO } from "../../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionWorkerEventService } from "../../../services/agentSession/AgentSessionWorkerEventService";
import { SessionTurnContinuationService } from "../../../services/agentSession/SessionTurnContinuationService";
import { isAgentSessionServiceError } from "../../../services/errors/AgentSessionServiceError";
import { JobBootstrapService } from "../../../services/job/JobBootstrapService";
import { JobQueryService } from "../../../services/job/JobQueryService";
import { recordLog, recordLogBatch, recordProgress, touchHeartbeat } from "../../../services/job/JobProgressService";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";
import {
  validateLogBatch,
  validateLogEntry,
  validateProgressUpdate,
} from "../../middleware/validation";

const jobQueries = new JobQueryService();
const bootstraps = new JobBootstrapService();
const bootstrapCredentials = new WorkerBootstrapCredentials(new SecretResolutionService());
const agentTurnDAO = new AgentTurnDAO();
const agentSessionDAO = new AgentSessionDAO();
const turnContinuationService = new SessionTurnContinuationService(
  agentSessionDAO,
  agentTurnDAO,
  new AgentSessionEventDAO(),
);
const workerEventService = new AgentSessionWorkerEventService(
  new AgentSessionEventDAO(),
  agentTurnDAO,
  agentSessionDAO,
  new AgentPendingRequestDAO(),
  turnContinuationService,
);

/**
 * What a worker fetches and reports about its run, besides its result: the
 * bootstrap payload, progress, logs and its session's events. Authenticated
 * by the run's callback token, not a person.
 */
export function registerJobWorkerCallbackRoutes(router: Router): void {
  router.get(
    "/:jobId/bootstrap",
    tenantMiddleware,
    validateCallbackToken,
    async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const tenantId = req.tenantId!;

        const bootstrap = await bootstraps.getBootstrapPayload(jobId);
        if (!bootstrap) {
          return res.status(404).json({ error: "Job not found" });
        }

        if (bootstrap.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied" });
        }

        if (!bootstrap.payload) {
          return res.status(404).json({
            error: "Bootstrap payload not found",
            message: "No bootstrap payload was stored for this job",
          });
        }

        let payload = bootstrap.payload;
        if (payload.workerType === "kubernetes") {
          if (bootstrap.status !== "active") {
            return res.status(403).json({ error: "Worker credentials are only available for an active run" });
          }
          payload = { ...payload, credentials: await bootstrapCredentials.resolve(payload) };
        }
        res.setHeader("Cache-Control", "no-store");
        return res.json({
          success: true,
          data: payload,
        });
      } catch (error) {
        logger.error("Failed to fetch job bootstrap payload", {
          error: error instanceof Error ? error.message : String(error),
          jobId: req.params.jobId,
        });
        return res.status(500).json({
          error: error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  // POST /:jobId/progress - Worker progress update (also updates heartbeat)
  router.post(
    "/:jobId/progress",
    tenantMiddleware,
    validateCallbackToken,
    validateProgressUpdate,
    async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const tenantId = req.tenantId!;
        const { step, message, details } = req.body;

        const job = await jobQueries.getJobStatus(jobId);
        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }
        if (job.data.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied" });
        }

        // Record progress (updates heartbeat)
        await recordProgress(jobId, { step, message, details });

        return res.json({
          success: true,
          jobId,
        });
      } catch (error) {
        logger.error("Failed to record job progress", {
          error: error instanceof Error ? error.message : String(error),
          jobId: req.params.jobId,
        });
        res.status(500).json({
          error: error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  // POST /:jobId/logs - Worker log lines
  router.post(
    "/:jobId/logs",
    tenantMiddleware,
    validateCallbackToken,
    validateLogEntry,
    async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const tenantId = req.tenantId!;
        const { level, message, source } = req.body;

        const job = await jobQueries.getJobStatus(jobId);
        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }
        if (job.data.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied" });
        }

        // Record log line
        await recordLog(jobId, { level, message, source });

        return res.json({
          success: true,
        });
      } catch (error) {
        logger.error("Failed to record job log", {
          error: error instanceof Error ? error.message : error,
          jobId: req.params.jobId,
        });
        res.status(500).json({
          error: error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  // POST /:jobId/logs/batch - Batch worker log lines
  router.post(
    "/:jobId/logs/batch",
    tenantMiddleware,
    validateCallbackToken,
    validateLogBatch,
    async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const tenantId = req.tenantId!;
        const { logs } = req.body;
        const job = await jobQueries.getJobStatus(jobId);

        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }
        if (job.data.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied" });
        }

        // Record batch of log lines with single bulk insert
        await recordLogBatch(jobId, logs);

        return res.json({
          success: true,
          count: logs.length,
        });
      } catch (error) {
        logger.error("Failed to record job log batch", {
          error: error instanceof Error ? error.message : error,
          jobId: req.params.jobId,
        });
        res.status(500).json({
          error: error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  // POST /:jobId/session-events/batch - Worker batch-ingest session events
  router.post(
    "/:jobId/session-events/batch",
    tenantMiddleware,
    validateCallbackToken,
    async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const { events } = req.body;

        if (!Array.isArray(events) || events.length === 0) {
          return res
            .status(400)
            .json({ error: "events must be a non-empty array" });
        }
        if (events.length > 100) {
          return res
            .status(400)
            .json({ error: "events array must not exceed 100 items" });
        }

        await workerEventService.batchIngest(jobId, events);
        await touchHeartbeat(jobId, new Date());
        return res.json({ success: true });
      } catch (err) {
        logger.error("Failed to ingest session events", {
          jobId: req.params.jobId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (isAgentSessionServiceError(err)) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // POST /:jobId/acp-session-id - Worker stores ACP session ID
  router.post(
    "/:jobId/acp-session-id",
    tenantMiddleware,
    validateCallbackToken,
    async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const { acpSessionId } = req.body;

        if (!acpSessionId || typeof acpSessionId !== "string") {
          return res
            .status(400)
            .json({ error: "acpSessionId must be a non-empty string" });
        }

        await workerEventService.storeAcpSessionId(jobId, acpSessionId);
        return res.json({ success: true });
      } catch (err) {
        logger.error("Failed to store ACP session ID", {
          jobId: req.params.jobId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (isAgentSessionServiceError(err)) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // POST /:jobId/conversation-state-url - Worker stores conversation state S3 URL
  router.post(
    "/:jobId/conversation-state-url",
    tenantMiddleware,
    validateCallbackToken,
    async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const { conversationStateUrl } = req.body;

        if (!conversationStateUrl || typeof conversationStateUrl !== "string") {
          return res
            .status(400)
            .json({ error: "conversationStateUrl must be a non-empty string" });
        }

        await workerEventService.storeConversationStateUrl(jobId, conversationStateUrl);
        return res.json({ success: true });
      } catch (err) {
        logger.error("Failed to store conversation state URL", {
          jobId: req.params.jobId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (isAgentSessionServiceError(err)) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}
