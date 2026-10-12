import type { Router } from "express";
import type { UpsertProjectScmConfigRequest } from "@viberglass/types";
import type { ProjectDAO } from "../../persistence/project/ProjectDAO";
import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type {
  IntegrationDAO,
  IntegrationCredentialDAO,
  ProjectIntegrationLinkDAO,
} from "../../persistence/integrations";
import { integrationRegistry } from "../../integrations/registerIntegrationPlugins";
import {
  validateProjectScmConfig,
  validateUuidParam,
} from "../middleware/validation";
import logger from "../../config/logger";

interface Dependencies {
  projectService: Pick<ProjectDAO, "getProject" | "updateProject">;
  projectScmConfigDAO: ProjectScmConfigDAO;
  projectIntegrationLinkDAO: Pick<ProjectIntegrationLinkDAO, "isLinked">;
  integrationDAO: Pick<IntegrationDAO, "getIntegration">;
  integrationCredentialDAO: Pick<IntegrationCredentialDAO, "getById">;
}

const normalizeOptionalString = (value?: string | null): string | null => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function registerProjectScmRoutes(
  router: Router,
  {
    projectService,
    projectScmConfigDAO,
    projectIntegrationLinkDAO,
    integrationDAO,
    integrationCredentialDAO,
  }: Dependencies,
): void {
  router.get(
    "/:projectId/scm-config",
    validateUuidParam("projectId"),
    async (req, res) => {
      try {
        const { projectId } = req.params;
        const project = await projectService.getProject(projectId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        const scmConfig = await projectScmConfigDAO.getByProjectId(projectId);
        if (!scmConfig) {
          return res.status(404).json({ error: "SCM configuration not found" });
        }

        res.json({ success: true, data: scmConfig });
      } catch (error) {
        logger.error("Error fetching project SCM config", {
          error: error instanceof Error ? error.message : error,
          projectId: req.params.projectId,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  router.put(
    "/:projectId/scm-config",
    validateUuidParam("projectId"),
    validateProjectScmConfig,
    async (req, res) => {
      try {
        const { projectId } = req.params;
        const project = await projectService.getProject(projectId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        if (project.backingKind === "files") {
          return res
            .status(409)
            .json({
              error: "Files spaces cannot have repository configuration.",
            });
        }
        const body: UpsertProjectScmConfigRequest = req.body;
        const integration = await integrationDAO.getIntegration(
          body.integrationId,
        );
        if (!integration) {
          return res.status(404).json({ error: "Integration not found" });
        }

        const plugin = integrationRegistry.get(integration.system);
        if (!plugin || plugin.category !== "scm") {
          return res.status(400).json({
            error: "Integration must be an SCM integration",
          });
        }

        const isLinked = await projectIntegrationLinkDAO.isLinked(
          projectId,
          body.integrationId,
        );
        if (!isLinked) {
          return res.status(409).json({
            error:
              "Integration must be linked to this project before use as SCM",
          });
        }

        // Validate integration credential if provided
        if (body.integrationCredentialId) {
          const credential = await integrationCredentialDAO.getById(
            body.integrationCredentialId,
          );
          if (!credential) {
            return res
              .status(404)
              .json({ error: "Integration credential not found" });
          }
          if (credential.integrationId !== body.integrationId) {
            return res.status(400).json({
              error:
                "Integration credential does not belong to the selected integration",
            });
          }
        }

        const saved = await projectScmConfigDAO.upsertByProjectId(projectId, {
          integrationId: body.integrationId,
          sourceRepository: body.sourceRepository.trim(),
          baseBranch: body.baseBranch?.trim() || "main",
          pullRequestRepository: normalizeOptionalString(
            body.pullRequestRepository,
          ),
          pullRequestBaseBranch: normalizeOptionalString(
            body.pullRequestBaseBranch,
          ),
          branchNameTemplate: normalizeOptionalString(body.branchNameTemplate),
          integrationCredentialId: body.integrationCredentialId ?? null,
        });

        await projectService.updateProject(projectId, {
          primaryScmIntegrationId: body.integrationId,
        });

        res.json({ success: true, data: saved });
      } catch (error) {
        logger.error("Error saving project SCM config", {
          error: error instanceof Error ? error.message : error,
          projectId: req.params.projectId,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  router.delete(
    "/:projectId/scm-config",
    validateUuidParam("projectId"),
    async (req, res) => {
      try {
        const { projectId } = req.params;
        const project = await projectService.getProject(projectId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        const deleted = await projectScmConfigDAO.deleteByProjectId(projectId);
        if (!deleted) {
          return res.status(404).json({ error: "SCM configuration not found" });
        }

        await projectService.updateProject(projectId, {
          primaryScmIntegrationId: null,
        });

        res.status(204).send();
      } catch (error) {
        logger.error("Error deleting project SCM config", {
          error: error instanceof Error ? error.message : error,
          projectId: req.params.projectId,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}
