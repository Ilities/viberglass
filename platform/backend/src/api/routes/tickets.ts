import express from "express";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { FileUploadService, upload } from "../../services/FileUploadService";
import { JobService } from "../../services/JobService";
import { WorkerExecutionService } from "../../workers/WorkerExecutionService";
import {
  validateCreateTicket,
  validateUpdateTicket,
  validateUuidParam,
  validateFileUploads,
  validateRunTicket,
} from "../middleware/validation";

const router = express.Router();
const ticketService = new TicketDAO();
const projectService = new ProjectDAO();
const clankerService = new ClankerDAO();
const fileUploadService = new FileUploadService();
const jobService = new JobService();
const workerExecutionService = new WorkerExecutionService();

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

// POST /api/tickets/:id/run - Run a ticket as a job with worker invocation
router.post(
  "/:id/run",
  validateUuidParam("id"),
  validateRunTicket,
  async (req, res) => {
    try {
      const ticketId = req.params.id;
      const { clankerId } = req.body;

      // Get ticket by id
      const ticket = await ticketService.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      // Get project by ticket.projectId
      const project = await projectService.getProject(ticket.projectId);
      if (!project) {
        console.error("[TicketRun] Project not found for ticket", {
          ticketId,
          projectId: ticket.projectId,
        });
        return res.status(500).json({
          error: "Data integrity issue",
          message: "Associated project not found",
        });
      }

      // Validate project has repositoryUrl
      if (!project.repositoryUrl) {
        return res.status(400).json({
          error: "Project has no repository configured",
          message: "Please configure a repository URL for this project before running tickets",
        });
      }

      // Get clanker by clankerId
      const clanker = await clankerService.getClanker(clankerId);
      if (!clanker) {
        return res.status(404).json({
          error: "Clanker not found",
        });
      }

      // Validate clanker has deploymentStrategyId and status is 'active'
      if (!clanker.deploymentStrategyId) {
        return res.status(400).json({
          error: "Clanker not ready",
          message: "Selected clanker has no deployment strategy configured",
        });
      }

      if (clanker.status !== "active") {
        return res.status(400).json({
          error: "Clanker not ready",
          message: `Selected clanker is ${clanker.status}. Only active clankers can run jobs.`,
        });
      }

      // Generate jobId
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create job via JobService.submitJob with ticket and clanker references
      const jobData = {
        id: jobId,
        tenantId: "api-server", // Hardcoded for now, per RESEARCH.md
        repository: project.repositoryUrl,
        task: `${ticket.title}\n\n${ticket.description}`,
        branch: undefined, // Worker creates branch
        baseBranch: "main",
        context: {
          ticketId: ticket.id,
          stepsToReproduce: ticket.description,
        },
        settings: {
          testRequired: false,
          maxChanges: 10,
        },
        timestamp: Date.now(),
      };

      await jobService.submitJob(jobData, {
        ticketId: ticket.id,
        clankerId: clanker.id,
      });

      // Invoke worker via WorkerExecutionService.executeJob - fire and forget
      // Don't await the result, just log errors
      workerExecutionService
        .executeJob(jobData, clanker)
        .then((result) => {
          console.info("[TicketRun] Worker invoked successfully", {
            ticketId,
            jobId,
            clankerId,
            executionId: result.executionId,
          });
        })
        .catch((error) => {
          console.error("[TicketRun] Worker invocation failed", {
            ticketId,
            jobId,
            clankerId,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      // Return 202 Accepted immediately
      return res.status(202).json({
        success: true,
        data: {
          jobId,
          status: "active",
        },
      });
    } catch (error) {
      console.error("Error running ticket:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to run ticket",
      });
    }
  },
);

export default router;
