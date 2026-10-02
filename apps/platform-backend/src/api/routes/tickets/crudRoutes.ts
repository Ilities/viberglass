import { NATIVE_TICKET_ORIGIN, TICKET_STATUS, type TicketOrigin } from "@viberglass/types";
import type { Router } from "express";
import logger from "../../../config/logger";
import type { ProjectDAO } from "../../../persistence/project/ProjectDAO";
import type { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import type { IntegrationDAO } from "../../../persistence/integrations";
import type { SpaceAccessService } from "../../../services/spaces/SpaceAccessService";
import type { TaskParticipantService } from "../../../services/tasks/TaskParticipantService";
import type { TaskActivityRecorder } from "../../../services/tasks/TaskActivityRecorder";
import { spaceViewerOf, tasksInBodyGuard } from "../../middleware/spaceAccessGuards";
import { requireRunnerRole } from "../../middleware/workspaceRoleGuards";
import { taskChangeGuard, tasksInBodyChangeGuard } from "../../middleware/taskChangeGuards";
import { integrationRegistry } from "../../../integrations/registerIntegrationPlugins";
import { isDomainError } from "../../../services/errors/DomainError";
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

interface TicketCrudRouteDependencies {
  ticketService: TicketDAO;
  projectService: ProjectDAO;
  fileUploadService: FileUploadService;
  integrationDAO: IntegrationDAO;
  spaceAccess: Pick<SpaceAccessService, "scopeFor" | "assertCanSee">;
  participants: Pick<TaskParticipantService, "assertCanSeeSpace">;
  activity: Pick<TaskActivityRecorder, "recordByCurrentActor">;
}

import { uuidRegex } from "./taskListQuery";

export function registerTicketCrudRoutes(
  router: Router,
  {
    ticketService,
    projectService,
    fileUploadService,
    integrationDAO,
    spaceAccess,
    participants,
    activity,
  }: TicketCrudRouteDependencies,
): void {
  // POST /api/tasks - Create a new ticket
  router.post(
    "/",
    requireRunnerRole,
    upload.fields([
      { name: "screenshot", maxCount: 1 },
      { name: "recording", maxCount: 1 },
    ]),
    validateFileUploads,
    parseMultipartJsonFields,
    validateCreateTicket,
    async (req, res, next) => {
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

        await spaceAccess.assertCanSee(spaceViewerOf(req)!, String(req.body.projectId));
        const project = await projectService.getProject(req.body.projectId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        let ticketSystem: TicketOrigin = NATIVE_TICKET_ORIGIN;
        if (project.primaryTicketingIntegrationId) {
          const integration = await integrationDAO.getIntegration(
            project.primaryTicketingIntegrationId,
          );
          const plugin =
            integration && integrationRegistry.get(integration.system);
          if (integration && plugin?.category === "ticketing") {
            ticketSystem = integration.system;
          }
        }

        const ownerId: string | undefined = req.body.ownerId;
        const watcherIds: string[] = req.body.watcherIds ?? [];
        for (const userId of [...(ownerId ? [ownerId] : []), ...watcherIds]) {
          await participants.assertCanSeeSpace(project.id, userId);
        }

        const ticket = await ticketService.createTicket(
          { ...req.body, ticketSystem, requesterId: req.authContext?.user.id },
          screenshotAsset,
          recordingAsset,
        );

        res.status(201).json({
          success: true,
          data: ticket,
        });
      } catch (error) {
        if (isDomainError(error)) return next(error);
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

  // GET /api/tasks/stats - Get ticket stats (optionally by project)
  router.get("/stats", async (req, res, next) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const projectSlug = req.query.projectSlug as string | undefined;

      if (!projectSlug && projectId && !uuidRegex.test(projectId)) {
        return res.status(400).json({
          error: "Invalid projectId format",
        });
      }

      const scope = await spaceAccess.scopeFor(spaceViewerOf(req)!, projectSlug || projectId);
      const stats = await ticketService.getTicketStats(scope.projectId, scope.projectIds);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      if (isDomainError(error)) return next(error);
      logger.error("Error fetching ticket stats", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to fetch ticket stats",
      });
    }
  });

  // POST /api/tasks/archive - Archive multiple tickets
  router.post("/archive", validateArchiveTickets, tasksInBodyGuard(), tasksInBodyChangeGuard("edit"), async (req, res) => {
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

  // POST /api/tasks/unarchive - Unarchive multiple tickets
  router.post("/unarchive", validateArchiveTickets, tasksInBodyGuard(), tasksInBodyChangeGuard("edit"), async (req, res) => {
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

  // PUT /api/tasks/:id - Update a ticket
  router.put(
    "/:id",
    validateUuidParam("id"),
    taskChangeGuard("edit"),
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
        if (existingTicket.status !== TICKET_STATUS.RESOLVED && updatedTicket?.status === TICKET_STATUS.RESOLVED) {
          await activity.recordByCurrentActor(req.params.id, "task_done");
        }

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

  // DELETE /api/tasks/:id - Delete a ticket
  router.delete("/:id", validateUuidParam("id"), taskChangeGuard("delete"), async (req, res) => {
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
}
