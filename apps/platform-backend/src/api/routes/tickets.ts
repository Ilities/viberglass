import express from "express";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { FileUploadService, upload } from "../../services/FileUploadService";
import { TicketExecutionService } from "../../services/TicketExecutionService";
import {
  validateCreateTicket,
  validateUpdateTicket,
  validateArchiveTickets,
  validateUuidParam,
  validateFileUploads,
  validateRunTicket,
  parseMultipartJsonFields,
  handleMulterError,
} from "../middleware/validation";
import { requireAuth } from "../middleware/authentication";
import logger from "../../config/logger";
import {
  TICKET_ARCHIVE_FILTER,
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
  type Severity,
  type TicketArchiveFilter,
  type TicketLifecycleStatus,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import { TicketPhaseDocumentService } from "../../services/TicketPhaseDocumentService";
import { TicketPhaseDocumentRevisionService } from "../../services/TicketPhaseDocumentRevisionService";
import { TicketPhaseDocumentCommentService } from "../../services/TicketPhaseDocumentCommentService";
import { TicketResearchService } from "../../services/TicketResearchService";
import { TicketPlanningService } from "../../services/TicketPlanningService";
import { TicketPlanningApprovalService } from "../../services/TicketPlanningApprovalService";
import { TicketWorkflowOverrideService } from "../../services/TicketWorkflowOverrideService";
import { TicketWorkflowService } from "../../services/TicketWorkflowService";
import { getFeedbackService } from "../../webhooks/webhookServiceFactory";
import type { FeedbackService } from "../../webhooks/FeedbackService";

const router = express.Router();
const ticketService = new TicketDAO();
const projectService = new ProjectDAO();
const fileUploadService = new FileUploadService();
const ticketExecutionService = new TicketExecutionService();
const ticketWorkflowService = new TicketWorkflowService();
const ticketPhaseDocumentService = new TicketPhaseDocumentService();
const ticketPhaseDocumentRevisionService =
  new TicketPhaseDocumentRevisionService();
const ticketPhaseDocumentCommentService =
  new TicketPhaseDocumentCommentService();
let feedbackService: FeedbackService | undefined;
try {
  feedbackService = getFeedbackService();
} catch (error) {
  logger.warn("Feedback service unavailable for ticket phase approvals", {
    error: error instanceof Error ? error.message : String(error),
  });
}
const ticketResearchService = new TicketResearchService(feedbackService);
const ticketPlanningService = new TicketPlanningService();
const ticketPlanningApprovalService = new TicketPlanningApprovalService(
  feedbackService,
);
const ticketWorkflowOverrideService = new TicketWorkflowOverrideService();
const ticketLifecycleStatuses: TicketLifecycleStatus[] = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.RESOLVED,
];

const ticketArchiveFilters: TicketArchiveFilter[] = [
  TICKET_ARCHIVE_FILTER.EXCLUDE,
  TICKET_ARCHIVE_FILTER.ONLY,
  TICKET_ARCHIVE_FILTER.INCLUDE,
];

function parseStatusesQuery(
  rawStatuses: string | string[] | undefined,
): TicketLifecycleStatus[] | null {
  if (!rawStatuses) {
    return [];
  }

  const source = Array.isArray(rawStatuses)
    ? rawStatuses.join(",")
    : rawStatuses;
  const values = source
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return [];
  }

  if (
    !values.every((value) =>
      ticketLifecycleStatuses.includes(value as TicketLifecycleStatus),
    )
  ) {
    return null;
  }

  return values as TicketLifecycleStatus[];
}

function parseArchivedQuery(
  rawArchived: string | string[] | undefined,
): TicketArchiveFilter | null {
  if (!rawArchived) {
    return TICKET_ARCHIVE_FILTER.EXCLUDE;
  }

  const value = Array.isArray(rawArchived) ? rawArchived[0] : rawArchived;
  if (!ticketArchiveFilters.includes(value as TicketArchiveFilter)) {
    return null;
  }

  return value as TicketArchiveFilter;
}

function parseSeverityQuery(
  rawSeverity: string | string[] | undefined,
): Severity | null {
  if (!rawSeverity) {
    return null;
  }

  const value = Array.isArray(rawSeverity) ? rawSeverity[0] : rawSeverity;
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }

  return null;
}

function parseWorkflowPhaseParam(rawPhase: string): TicketWorkflowPhase | null {
  if (
    rawPhase === TICKET_WORKFLOW_PHASE.RESEARCH ||
    rawPhase === TICKET_WORKFLOW_PHASE.PLANNING ||
    rawPhase === TICKET_WORKFLOW_PHASE.EXECUTION
  ) {
    return rawPhase;
  }

  return null;
}

function parseCommentableWorkflowPhaseParam(
  rawPhase: string,
): "research" | "planning" | null {
  if (
    rawPhase === TICKET_WORKFLOW_PHASE.RESEARCH ||
    rawPhase === TICKET_WORKFLOW_PHASE.PLANNING
  ) {
    return rawPhase;
  }

  return null;
}

// POST /api/tickets - Create a new ticket
router.use(requireAuth);
router.post(
  "/",
  upload.fields([
    { name: "screenshot", maxCount: 1 },
    { name: "recording", maxCount: 1 },
  ]),
  validateFileUploads,
  parseMultipartJsonFields,
  validateCreateTicket,
  async (req, res) => {
    try {
      let recordingAsset;
      let screenshotAsset;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files) {
        const screenshotFile = files.screenshot?.[0];
        const recordingFile = files.recording?.[0];

        // Upload screenshot if present
        if (screenshotFile) {
          screenshotAsset =
            await fileUploadService.uploadScreenshot(screenshotFile);
        }

        // Upload recording if present
        if (recordingFile) {
          recordingAsset =
            await fileUploadService.uploadRecording(recordingFile);
        }
      }

      // Create ticket
      const ticket = await ticketService.createTicket(
        req.body,
        screenshotAsset,
        recordingAsset,
      );

      res.status(201).json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      logger.error("Error creating ticket", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to create ticket",
      });
    }
  },
);

// Apply multer error handler to the route
router.use("/", handleMulterError);

// GET /api/tickets/stats - Get ticket stats (optionally by project)
router.get("/stats", async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const projectSlug = req.query.projectSlug as string | undefined;

    let targetProjectId = projectId;

    if (projectSlug) {
      const project = await projectService.findByName(projectSlug);
      if (!project) {
        return res.status(404).json({
          error: "Project not found",
        });
      }
      targetProjectId = project.id;
    } else if (projectId) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        return res.status(400).json({
          error: "Invalid projectId format",
        });
      }
    }

    const stats = await ticketService.getTicketStats(targetProjectId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Error fetching ticket stats", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch ticket stats",
    });
  }
});

// GET /api/tickets/media/:mediaId/content - Stream media content
router.get(
  "/media/:mediaId/content",
  validateUuidParam("mediaId"),
  async (req, res) => {
    try {
      const media = await ticketService.getMediaAssetById(req.params.mediaId);

      if (!media) {
        return res.status(404).json({
          error: "Media asset not found",
        });
      }

      const source = media.storageUrl || media.url;
      if (source.startsWith("file://")) {
        const filePath = decodeURIComponent(new URL(source).pathname);
        return res.sendFile(filePath, {
          headers: {
            "Content-Type": media.mimeType,
            "Content-Disposition": `inline; filename="${media.filename}"`,
          },
        });
      }

      const signedUrl = await fileUploadService.generateSignedUrlFromStorageUrl(
        source,
        3600,
      );
      return res.redirect(signedUrl);
    } catch (error) {
      logger.error("Error streaming media asset", {
        mediaId: req.params.mediaId,
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to stream media asset",
      });
    }
  },
);

// POST /api/tickets/archive - Archive multiple tickets
router.post("/archive", validateArchiveTickets, async (req, res) => {
  try {
    const updatedCount = await ticketService.archiveTickets(req.body.ticketIds);
    res.json({
      success: true,
      data: { updatedCount },
    });
  } catch (error) {
    logger.error("Error archiving tickets", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to archive tickets",
    });
  }
});

// POST /api/tickets/unarchive - Unarchive multiple tickets
router.post("/unarchive", validateArchiveTickets, async (req, res) => {
  try {
    const updatedCount = await ticketService.unarchiveTickets(
      req.body.ticketIds,
    );
    res.json({
      success: true,
      data: { updatedCount },
    });
  } catch (error) {
    logger.error("Error unarchiving tickets", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to unarchive tickets",
    });
  }
});

// GET /api/tickets/:id/phases - Get workflow phase state for a ticket
router.get("/:id/phases", validateUuidParam("id"), async (req, res) => {
  try {
    const workflow = await ticketWorkflowService.getTicketWorkflow(
      req.params.id,
    );

    res.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Ticket not found") {
      return res.status(404).json({
        error: "Ticket not found",
      });
    }

    logger.error("Error fetching ticket workflow", {
      ticketId: req.params.id,
      error: message,
    });
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch ticket workflow",
    });
  }
});

// POST /api/tickets/:id/phases/:phase/advance - Advance workflow phase
router.post(
  "/:id/phases/:phase/advance",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const targetPhase = parseWorkflowPhaseParam(req.params.phase);
      if (!targetPhase) {
        return res.status(400).json({
          error: "Invalid workflow phase",
        });
      }

      const result = await ticketWorkflowService.advancePhase(
        req.params.id,
        targetPhase,
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      if (message.startsWith("Cannot advance ticket workflow")) {
        return res.status(409).json({
          error: message,
        });
      }

      logger.error("Error advancing ticket workflow", {
        ticketId: req.params.id,
        targetPhase: req.params.phase,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to advance ticket workflow",
      });
    }
  },
);

// GET /api/tickets/:id/phases/research - Get research phase document
router.get(
  "/:id/phases/research",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const phase = await ticketResearchService.getResearchPhase(req.params.id);

      res.json({
        success: true,
        data: phase,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error fetching research document", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to fetch research document",
      });
    }
  },
);

// GET /api/tickets/:id/phases/:phase/revisions - Get revision history for a phase document
router.get(
  "/:id/phases/:phase/revisions",
  validateUuidParam("id"),
  async (req, res) => {
    const phase = parseWorkflowPhaseParam(req.params.phase);
    if (!phase) {
      return res.status(400).json({
        error: "Invalid workflow phase",
      });
    }

    try {
      const revisions = await ticketPhaseDocumentRevisionService.listRevisions(
        req.params.id,
        phase,
      );

      return res.json({
        success: true,
        data: revisions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error fetching phase document revisions", {
        ticketId: req.params.id,
        phase,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to fetch phase document revisions",
      });
    }
  },
);

// GET /api/tickets/:id/phases/:phase/comments - Get inline comments for a phase document
router.get(
  "/:id/phases/:phase/comments",
  validateUuidParam("id"),
  async (req, res) => {
    const phase = parseCommentableWorkflowPhaseParam(req.params.phase);
    if (!phase) {
      return res.status(400).json({
        error: "Comments are only supported for research and planning phases",
      });
    }

    try {
      const comments = await ticketPhaseDocumentCommentService.listComments(
        req.params.id,
        phase,
      );

      return res.json({
        success: true,
        data: comments,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error fetching phase document comments", {
        ticketId: req.params.id,
        phase,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to fetch phase document comments",
      });
    }
  },
);

// POST /api/tickets/:id/phases/:phase/comments - Create an inline comment for a phase document
router.post(
  "/:id/phases/:phase/comments",
  validateUuidParam("id"),
  async (req, res) => {
    const phase = parseCommentableWorkflowPhaseParam(req.params.phase);
    if (!phase) {
      return res.status(400).json({
        error: "Comments are only supported for research and planning phases",
      });
    }

    const { lineNumber, content } = req.body;
    if (!Number.isInteger(lineNumber) || typeof content !== "string") {
      return res.status(400).json({
        error: "Validation error",
        message: "lineNumber must be an integer and content must be a string",
      });
    }

    try {
      const comment = await ticketPhaseDocumentCommentService.createComment(
        req.params.id,
        phase,
        {
          lineNumber,
          content,
          actor: req.auth?.user.email,
        },
      );

      return res.status(201).json({
        success: true,
        data: comment,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      if (
        message === "Comment content is required" ||
        message === "Cannot comment on an empty document" ||
        message === "Line anchor is out of range"
      ) {
        return res.status(400).json({
          error: message,
        });
      }

      logger.error("Error creating phase document comment", {
        ticketId: req.params.id,
        phase,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to create phase document comment",
      });
    }
  },
);

// PUT /api/tickets/:id/phases/:phase/comments/:commentId - Update an inline comment
router.put(
  "/:id/phases/:phase/comments/:commentId",
  validateUuidParam("id"),
  validateUuidParam("commentId"),
  async (req, res) => {
    const phase = parseCommentableWorkflowPhaseParam(req.params.phase);
    if (!phase) {
      return res.status(400).json({
        error: "Comments are only supported for research and planning phases",
      });
    }

    const { content, status } = req.body;
    const statusIsValid =
      status === undefined || status === "open" || status === "resolved";
    if (
      (content !== undefined && typeof content !== "string") ||
      !statusIsValid
    ) {
      return res.status(400).json({
        error: "Validation error",
        message: "content must be a string and status must be open or resolved",
      });
    }

    try {
      const comment = await ticketPhaseDocumentCommentService.updateComment(
        req.params.id,
        phase,
        req.params.commentId,
        {
          content,
          status,
          actor: req.auth?.user.email,
        },
      );

      return res.json({
        success: true,
        data: comment,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Comment not found" || message === "Ticket not found") {
        return res.status(404).json({
          error: message,
        });
      }

      if (
        message === "Comment content is required" ||
        message === "At least one comment field must be provided"
      ) {
        return res.status(400).json({
          error: message,
        });
      }

      logger.error("Error updating phase document comment", {
        ticketId: req.params.id,
        phase,
        commentId: req.params.commentId,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to update phase document comment",
      });
    }
  },
);

// POST /api/tickets/:id/phases/research/run - Run research generation
router.post(
  "/:id/phases/research/run",
  validateUuidParam("id"),
  validateRunTicket,
  async (req, res) => {
    try {
      const result = await ticketResearchService.runResearch(
        req.params.id,
        req.body,
      );

      return res.status(202).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error running research", {
        ticketId: req.params.id,
        error: message,
      });

      const statusCode = message.includes("not found")
        ? 404
        : message.includes("only allowed during the research phase") ||
            message.includes("no repository") ||
            message.includes("no deployment strategy") ||
            message.includes("Only active")
          ? 400
          : 500;

      return res.status(statusCode).json({
        error: statusCode === 500 ? "Internal server error" : "Bad request",
        message,
      });
    }
  },
);

// PUT /api/tickets/:id/phases/research/document - Save research phase document
router.put(
  "/:id/phases/research/document",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const { content } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({
          error: "Validation error",
          message: "content must be a string",
        });
      }

      const document = await ticketPhaseDocumentService.saveDocument(
        req.params.id,
        TICKET_WORKFLOW_PHASE.RESEARCH,
        content,
        { actor: req.auth?.user.email },
      );

      res.json({
        success: true,
        data: document,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error saving research document", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to save research document",
      });
    }
  },
);

// POST /api/tickets/:id/phases/research/request-approval - Request approval for research
router.post(
  "/:id/phases/research/request-approval",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const actor = req.auth?.user.email;
      const result = await ticketResearchService.requestApproval(
        req.params.id,
        actor,
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      if (message.includes("only allowed during the research phase")) {
        return res.status(409).json({
          error: message,
        });
      }

      logger.error("Error requesting research approval", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to request research approval",
      });
    }
  },
);

// POST /api/tickets/:id/phases/research/approve - Approve research document
router.post(
  "/:id/phases/research/approve",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const actor = req.auth?.user.email;
      const result = await ticketResearchService.approve(req.params.id, actor);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      if (message.includes("only allowed during the research phase")) {
        return res.status(409).json({
          error: message,
        });
      }

      logger.error("Error approving research document", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to approve research document",
      });
    }
  },
);

// POST /api/tickets/:id/phases/research/revoke-approval - Revoke research approval
router.post(
  "/:id/phases/research/revoke-approval",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const actor = req.auth?.user.email;
      const result = await ticketResearchService.revokeApproval(
        req.params.id,
        actor,
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error revoking research approval", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to revoke research approval",
      });
    }
  },
);

// GET /api/tickets/:id/phases/planning - Get planning phase document
router.get(
  "/:id/phases/planning",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const phase = await ticketPlanningService.getPlanningPhase(req.params.id);

      res.json({
        success: true,
        data: phase,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error fetching planning document", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to fetch planning document",
      });
    }
  },
);

// POST /api/tickets/:id/phases/planning/request-approval - Request approval for planning
router.post(
  "/:id/phases/planning/request-approval",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const actor = req.auth?.user.email;
      const result = await ticketPlanningApprovalService.requestApproval(
        req.params.id,
        actor,
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      if (message.includes("only be requested during the planning phase")) {
        return res.status(409).json({
          error: message,
        });
      }

      logger.error("Error requesting planning approval", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to request planning approval",
      });
    }
  },
);

// POST /api/tickets/:id/phases/planning/approve - Approve planning document
router.post(
  "/:id/phases/planning/approve",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const actor = req.auth?.user.email;
      const result = await ticketPlanningApprovalService.approve(
        req.params.id,
        actor,
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      if (message.includes("only be granted during the planning phase")) {
        return res.status(409).json({
          error: message,
        });
      }

      logger.error("Error approving planning document", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to approve planning document",
      });
    }
  },
);

// POST /api/tickets/:id/phases/planning/revoke-approval - Revoke planning approval
router.post(
  "/:id/phases/planning/revoke-approval",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const actor = req.auth?.user.email;
      const result = await ticketPlanningApprovalService.revokeApproval(
        req.params.id,
        actor,
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error revoking planning approval", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to revoke planning approval",
      });
    }
  },
);

// PUT /api/tickets/:id/phases/planning/document - Save planning phase document
router.put(
  "/:id/phases/planning/document",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const { content } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({
          error: "Validation error",
          message: "content must be a string",
        });
      }

      const document = await ticketPhaseDocumentService.saveDocument(
        req.params.id,
        TICKET_WORKFLOW_PHASE.PLANNING,
        content,
        { actor: req.auth?.user.email },
      );

      res.json({
        success: true,
        data: document,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error saving planning document", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to save planning document",
      });
    }
  },
);

// POST /api/tickets/:id/phases/planning/run - Run planning generation
router.post(
  "/:id/phases/planning/run",
  validateUuidParam("id"),
  validateRunTicket,
  async (req, res) => {
    try {
      const result = await ticketPlanningService.runPlanning(
        req.params.id,
        req.body,
      );

      return res.status(202).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error running planning", {
        ticketId: req.params.id,
        error: message,
      });

      const statusCode = message.includes("not found")
        ? 404
        : message.includes("only allowed during the planning") ||
            message.includes("no repository") ||
            message.includes("no deployment strategy") ||
            message.includes("Only active")
          ? 400
          : 500;

      return res.status(statusCode).json({
        error: statusCode === 500 ? "Internal server error" : "Bad request",
        message,
      });
    }
  },
);

// GET /api/tickets/:id - Get a specific ticket
router.get("/:id", validateUuidParam("id"), async (req, res) => {
  try {
    const ticket = await ticketService.getTicket(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        error: "Ticket not found",
      });
    }

    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    logger.error("Error fetching ticket", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch ticket",
    });
  }
});

// PUT /api/tickets/:id - Update a ticket
router.put(
  "/:id",
  validateUuidParam("id"),
  validateUpdateTicket,
  async (req, res) => {
    try {
      // Check if ticket exists
      const existingTicket = await ticketService.getTicket(req.params.id);

      if (!existingTicket) {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      // Update ticket
      await ticketService.updateTicket(req.params.id, req.body);

      // Fetch updated ticket
      const updatedTicket = await ticketService.getTicket(req.params.id);

      res.json({
        success: true,
        data: updatedTicket,
      });
    } catch (error) {
      logger.error("Error updating ticket", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to update ticket",
      });
    }
  },
);

// DELETE /api/tickets/:id - Delete a ticket
router.delete("/:id", validateUuidParam("id"), async (req, res) => {
  try {
    const deleted = await ticketService.deleteTicket(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        error: "Ticket not found",
      });
    }

    res.json({
      success: true,
      message: "Ticket deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting ticket", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to delete ticket",
    });
  }
});

// GET /api/tickets - Get tickets, optionally filtered by project
router.get("/", async (req, res) => {
  try {
    const projectId = req.query.projectId as string;
    const projectSlug = req.query.projectSlug as string;
    const limit = Math.max(
      1,
      Math.min(200, parseInt(req.query.limit as string, 10) || 50),
    );
    const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
    const statuses = parseStatusesQuery(
      req.query.statuses as string | string[] | undefined,
    );
    const archived = parseArchivedQuery(
      req.query.archived as string | string[] | undefined,
    );
    const severity = parseSeverityQuery(
      req.query.severity as string | string[] | undefined,
    );
    const searchRaw = req.query.search as string | undefined;
    const search = typeof searchRaw === "string" ? searchRaw.trim() : undefined;

    let targetProjectId: string | undefined = projectId;

    if (statuses === null) {
      return res.status(400).json({
        error: "Invalid statuses filter",
      });
    }

    if (archived === null) {
      return res.status(400).json({
        error: "Invalid archived filter",
      });
    }

    if ((req.query.severity as string | undefined) && !severity) {
      return res.status(400).json({
        error: "Invalid severity filter",
      });
    }

    if (projectSlug) {
      // If slug is provided, resolve it to an ID
      const project = await projectService.findByName(projectSlug);
      if (!project) {
        return res.status(404).json({
          error: "Project not found",
        });
      }
      targetProjectId = project.id;
    } else if (projectId) {
      // Validate projectId format if provided
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        return res.status(400).json({
          error: "Invalid projectId format",
        });
      }
    } else {
      targetProjectId = undefined;
    }

    const { tickets, total } = await ticketService.getTicketsWithFilters({
      limit,
      offset,
      projectId: targetProjectId,
      statuses,
      archived,
      severity: severity || undefined,
      search,
    });

    res.json({
      success: true,
      data: tickets,
      pagination: {
        limit,
        offset,
        count: tickets.length,
        total,
      },
    });
  } catch (error) {
    logger.error("Error fetching tickets", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch tickets",
    });
  }
});

// GET /api/tickets/:id/media/:mediaId/signed-url - Get signed URL for media access
router.get(
  "/:id/media/:mediaId/signed-url",
  validateUuidParam("id"),
  validateUuidParam("mediaId"),
  async (req, res) => {
    try {
      const ticket = await ticketService.getTicket(req.params.id);

      if (!ticket) {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      const mediaId = req.params.mediaId;
      let mediaAsset;

      // Find the requested media asset
      if (ticket.screenshot?.id === mediaId) {
        mediaAsset = ticket.screenshot;
      } else if (ticket.recording?.id === mediaId) {
        mediaAsset = ticket.recording;
      } else {
        return res.status(404).json({
          error: "Media asset not found",
        });
      }

      const source = mediaAsset.storageUrl || mediaAsset.url;
      const signedUrl = source.startsWith("file://")
        ? fileUploadService.getMediaContentUrl(mediaId)
        : await fileUploadService.generateSignedUrlFromStorageUrl(source, 3600);

      res.json({
        success: true,
        data: {
          signedUrl,
          expiresIn: 3600,
        },
      });
    } catch (error) {
      logger.error("Error generating signed URL", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to generate signed URL",
      });
    }
  },
);

// POST /api/tickets/:id/run - Run a ticket as a job with worker invocation
router.post(
  "/:id/run",
  validateUuidParam("id"),
  validateRunTicket,
  async (req, res) => {
    try {
      const ticketId = req.params.id;
      const result = await ticketExecutionService.runTicket(ticketId, req.body);

      // Return 202 Accepted immediately
      return res.status(202).json({
        success: true,
        data: result,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Error running ticket", {
        error: error.message,
      });

      const errorMessage = error.message || "Failed to run ticket";
      const statusCode = errorMessage.includes("not found")
        ? 404
        : errorMessage.includes("planning document is approved")
          ? 409
          : errorMessage.includes("no repository") ||
              errorMessage.includes("not ready") ||
              errorMessage.includes("Only active")
            ? 400
            : 500;

      res.status(statusCode).json({
        error: statusCode === 500 ? "Internal server error" : "Bad request",
        message: errorMessage,
      });
    }
  },
);

// POST /api/tickets/:id/workflow/override-to-execution - Explicitly bypass research/planning gate
router.post(
  "/:id/workflow/override-to-execution",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const reason =
        typeof req.body?.reason === "string" ? req.body.reason : "";
      const actor = req.auth?.user.email;
      const ticket = await ticketWorkflowOverrideService.overrideToExecution(
        req.params.id,
        reason,
        actor,
      );

      return res.json({
        success: true,
        data: ticket,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const message = error.message || "Failed to override workflow";

      logger.error("Error overriding ticket workflow to execution", {
        ticketId: req.params.id,
        error: message,
      });

      const statusCode =
        message === "Ticket not found"
          ? 404
          : message.includes("reason is required")
            ? 400
            : message.includes("already been overridden") ||
                message.includes("already in the execution")
              ? 409
              : 500;

      return res.status(statusCode).json({
        error: statusCode === 500 ? "Internal server error" : "Bad request",
        message,
      });
    }
  },
);

export default router;
