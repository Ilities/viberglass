import type { Router } from "express";
import type { UpsertProjectScmConfigRequest } from "@viberglass/types";
import type { ProjectDAO } from "../../persistence/project/ProjectDAO";
import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type {
  IntegrationDAO,
  IntegrationCredentialDAO,
  ProjectIntegrationLinkDAO,
} from "../../persistence/integrations";
import { RepositoryAccessError, type RepositoryRef } from "@viberglass/integration-core";
import { integrationRegistry } from "../../integrations/registerIntegrationPlugins";
import type { SecretResolutionService } from "../../services/SecretResolutionService";
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
  integrationCredentialDAO: Pick<IntegrationCredentialDAO, "getById" | "getDefaultForIntegration">;
  secrets: Pick<SecretResolutionService, "resolveSecretValue">;
}

/** Why the code host refused the token for the repository, or null when it can push there. */
async function accessRefusal(
  checkAccess: (ref: RepositoryRef, token: string) => Promise<unknown>,
  ref: RepositoryRef,
  token: string,
): Promise<string | null> {
  try {
    await checkAccess(ref, token);
    return null;
  } catch (error) {
    if (error instanceof RepositoryAccessError) return error.message;
    throw error;
  }
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
    secrets,
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

        // Saved the way setup saves it, as the host's own URL, so everything that reads it later agrees.
        const host = plugin.repository;
        const sourceRef = host?.parseRepository(body.sourceRepository) ?? null;
        const pullRequestInput = normalizeOptionalString(body.pullRequestRepository);
        const pullRequestRef = host && pullRequestInput ? host.parseRepository(pullRequestInput) : null;
        if (host && (!sourceRef || (pullRequestInput && !pullRequestRef))) {
          return res.status(400).json({
            error: "Enter the repository as owner/name or its URL",
          });
        }
        const sourceRepository = sourceRef?.url ?? body.sourceRepository.trim();
        const pullRequestRepository = pullRequestRef?.url ?? pullRequestInput;

        // Validate integration credential if provided
        let credential = null;
        if (body.integrationCredentialId) {
          credential = await integrationCredentialDAO.getById(
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

        // The token runs will use, checked the way setup checks it, so a token that can't push fails here rather than mid-run.
        credential ??= await integrationCredentialDAO.getDefaultForIntegration(body.integrationId);
        if (host && sourceRef && credential?.credentialType === "token") {
          const token = (await secrets.resolveSecretValue(credential.secretId))?.trim();
          const refused = token ? await accessRefusal(host.checkAccess.bind(host), sourceRef, token) : null;
          if (refused) return res.status(422).json({ error: refused });
        }

        const saved = await projectScmConfigDAO.upsertByProjectId(projectId, {
          integrationId: body.integrationId,
          sourceRepository,
          baseBranch: body.baseBranch?.trim() || "main",
          pullRequestRepository,
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
