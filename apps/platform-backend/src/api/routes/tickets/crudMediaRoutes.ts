import {
  TICKET_ARCHIVE_FILTER,
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
  type Severity,
  type TicketArchiveFilter,
  type TicketLifecycleStatus,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import type { Router } from "express";
import logger from "../../../config/logger";
import type { ProjectDAO } from "../../../persistence/project/ProjectDAO";
import type { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import {
  upload,
  type FileUploadService,
} from "../../../services/FileUploadService";
import {
  handleMulterError,
  parseMultipartJsonFields,
  validateArchiveTickets,
  validateCreateTicket,
  validateFileUploads,
  validateUpdateTicket,
  validateUuidParam,
} from "../../middleware/validation";

interface TicketCrudMediaRouteDependencies {
  ticketService: TicketDAO;
  projectService: ProjectDAO;
  fileUploadService: FileUploadService;
}

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ticketLifecycleStatuses: TicketLifecycleStatus[] = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.IN_REVIEW,
  TICKET_STATUS.RESOLVED,
];

const ticketWorkflowPhases: TicketWorkflowPhase[] = [
  TICKET_WORKFLOW_PHASE.RESEARCH,
  TICKET_WORKFLOW_PHASE.PLANNING,
  TICKET_WORKFLOW_PHASE.EXECUTION,
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

function parseWorkflowPhasesQuery(
  rawWorkflowPhases: string | string[] | undefined,
): TicketWorkflowPhase[] | null {
  if (!rawWorkflowPhases) {
    return [];
  }

  const source = Array.isArray(rawWorkflowPhases)
    ? rawWorkflowPhases.join(",")
    : rawWorkflowPhases;
  const values = source
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return [];
  }

  if (
    !values.every((value) =>
      ticketWorkflowPhases.includes(value as TicketWorkflowPhase),
    )
  ) {
    return null;
  }

  return values as TicketWorkflowPhase[];
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

export function registerTicketCrudMediaRoutes(
  router: Router,
  {
    ticketService,
    projectService,
    fileUploadService,
  }: TicketCrudMediaRouteDependencies,
): void {
  // POST /api/tickets - Create a new ticket
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
        const files = req.files as {
          [fieldname: string]: Express.Multer.File[];
        };
        if (files) {
          const screenshotFile = files.screenshot?.[0];
          const recordingFile = files.recording?.[0];

          if (screenshotFile) {
            screenshotAsset =
              await fileUploadService.uploadScreenshot(screenshotFile);
          }

          if (recordingFile) {
            recordingAsset =
              await fileUploadService.uploadRecording(recordingFile);
          }
        }

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
      } else if (projectId && !uuidRegex.test(projectId)) {
        return res.status(400).json({
          error: "Invalid projectId format",
        });
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

        const signedUrl =
          await fileUploadService.generateSignedUrlFromStorageUrl(source, 3600);

        try {
          const s3Response = await fetch(signedUrl);
          if (!s3Response.ok) {
            return res.status(s3Response.status).json({
              error: "Failed to fetch media from storage",
            });
          }
          const buffer = await s3Response.arrayBuffer();
          res.set({
            "Content-Type": media.mimeType,
            "Content-Disposition": `inline; filename="${media.filename}"`,
            "Content-Length": buffer.byteLength,
          });
          return res.send(Buffer.from(buffer));
        } catch (error) {
          logger.error("Error proxying media from S3", {
            mediaId: req.params.mediaId,
            error: error instanceof Error ? error.message : error,
          });
          return res.status(500).json({
            error: "Internal server error",
            message: "Failed to fetch media",
          });
        }
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
      const updatedCount = await ticketService.archiveTickets(
        req.body.ticketIds,
      );
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
        const existingTicket = await ticketService.getTicket(req.params.id);

        if (!existingTicket) {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        await ticketService.updateTicket(req.params.id, req.body);
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
      const workflowPhases = parseWorkflowPhasesQuery(
        req.query.workflowPhases as string | string[] | undefined,
      );
      const archived = parseArchivedQuery(
        req.query.archived as string | string[] | undefined,
      );
      const severity = parseSeverityQuery(
        req.query.severity as string | string[] | undefined,
      );
      const searchRaw = req.query.search as string | undefined;
      const search =
        typeof searchRaw === "string" ? searchRaw.trim() : undefined;

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

      if (workflowPhases === null) {
        return res.status(400).json({
          error: "Invalid workflowPhases filter",
        });
      }

      if ((req.query.severity as string | undefined) && !severity) {
        return res.status(400).json({
          error: "Invalid severity filter",
        });
      }

      if (projectSlug) {
        const project = await projectService.findByName(projectSlug);
        if (!project) {
          return res.status(404).json({
            error: "Project not found",
          });
        }
        targetProjectId = project.id;
      } else if (projectId) {
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
        workflowPhases,
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
          : await fileUploadService.generateSignedUrlFromStorageUrl(
              source,
              3600,
            );

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
}
