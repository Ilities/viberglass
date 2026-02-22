import express from "express";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { FileUploadService, upload } from "../../services/FileUploadService";
import {
  TicketExecutionService,
} from "../../services/TicketExecutionService";
import {
  validateCreateTicket,
  validateUpdateTicket,
  validateUuidParam,
  validateFileUploads,
  validateRunTicket,
  parseMultipartJsonFields,
  handleMulterError,
} from "../middleware/validation";
import { requireAuth } from "../middleware/authentication";
import logger from "../../config/logger";

const router = express.Router();
const ticketService = new TicketDAO();
const projectService = new ProjectDAO();
const fileUploadService = new FileUploadService();
const ticketExecutionService = new TicketExecutionService();

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

      const signedUrl =
        await fileUploadService.generateSignedUrlFromStorageUrl(source, 3600);
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
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let targetProjectId: string | undefined = projectId;

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

    const tickets = await ticketService.getTickets(
      limit,
      offset,
      targetProjectId,
    );

    res.json({
      success: true,
      data: tickets,
      pagination: {
        limit,
        offset,
        count: tickets.length,
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
      const signedUrl =
        source.startsWith("file://")
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

export default router;
