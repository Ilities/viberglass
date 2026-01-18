import express from "express";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { FileUploadService, upload } from "../../services/FileUploadService";
import {
  validateCreateTicket,
  validateUpdateTicket,
  validateUuidParam,
  validateFileUploads,
} from "../middleware/validation";

const router = express.Router();
const ticketService = new TicketDAO();
const projectService = new ProjectDAO();
const fileUploadService = new FileUploadService();

// POST /api/tickets - Create a new ticket
router.post(
  "/",
  upload.fields([
    { name: "screenshot", maxCount: 1 },
    { name: "recording", maxCount: 1 },
  ]),
  validateFileUploads,
  validateCreateTicket,
  async (req, res) => {
    try {
      let recordingAsset;
      let screenshotAsset;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files) {
        const screenshotFile = files.screenshot[0];
        const recordingFile = files.recording ? files.recording[0] : undefined;

        // Upload screenshot
        screenshotAsset =
          await fileUploadService.uploadScreenshot(screenshotFile);

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
      console.error("Error creating ticket:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to create ticket",
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
    console.error("Error fetching ticket:", error);
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
      console.error("Error updating ticket:", error);
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
    console.error("Error deleting ticket:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to delete ticket",
    });
  }
});

// GET /api/tickets - Get tickets by project
router.get("/", async (req, res) => {
  try {
    const projectId = req.query.projectId as string;
    const projectSlug = req.query.projectSlug as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let targetProjectId = projectId;

    if (!projectId && !projectSlug) {
      return res.status(400).json({
        error: "Either projectId or projectSlug query parameter is required",
      });
    }

    // If slug is provided, resolve it to an ID
    if (projectSlug) {
      const project = await projectService.findByName(projectSlug);
      if (!project) {
        return res.status(404).json({
          error: "Project not found",
        });
      }
      targetProjectId = project.id;
    } else {
      // Validate projectId format if slug wasn't used
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(targetProjectId)) {
        return res.status(400).json({
          error: "Invalid projectId format",
        });
      }
    }

    const tickets = await ticketService.getTicketsByProject(
      targetProjectId,
      limit,
      offset,
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
    console.error("Error fetching tickets:", error);
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
      if (ticket.screenshot.id === mediaId) {
        mediaAsset = ticket.screenshot;
      } else if (ticket.recording && ticket.recording.id === mediaId) {
        mediaAsset = ticket.recording;
      } else {
        return res.status(404).json({
          error: "Media asset not found",
        });
      }

      // Generate signed URL
      const key = fileUploadService.getKeyFromUrl(mediaAsset.url);
      const signedUrl = await fileUploadService.generateSignedUrl(key, 3600); // 1 hour expiry

      res.json({
        success: true,
        data: {
          signedUrl,
          expiresIn: 3600,
        },
      });
    } catch (error) {
      console.error("Error generating signed URL:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to generate signed URL",
      });
    }
  },
);

export default router;
