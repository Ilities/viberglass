import type { NextFunction, Request, Response, Router } from "express";
import type { Project } from "@viberglass/types";
import type { ProjectIntegrationLinkDAO } from "../../persistence/integrations/ProjectIntegrationLinkDAO";
import type { ConnectionRepositoryCreator } from "../../services/repositories/ConnectionRepositoryCreator";
import { validateNewConnectionRepository, validateUuidParam } from "../middleware/validation";

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/** GET /:id/repository-owners: where the connection's token (`credentialId`, else its default) can create repositories. */
export function registerRepositoryOwnerRoutes(router: Router, creator: Pick<ConnectionRepositoryCreator, "listOwners">): void {
  router.get(
    "/:id/repository-owners",
    validateUuidParam("id"),
    asyncRoute(async (req, res) => {
      const credentialId = typeof req.query.credentialId === "string" && req.query.credentialId ? req.query.credentialId : null;
      res.json({ success: true, data: await creator.listOwners(req.params.id, credentialId) });
    }),
  );
}

interface SpaceRepositoryDependencies {
  projects: { getProject(id: string): Promise<Pick<Project, "id" | "backingKind"> | null> };
  links: Pick<ProjectIntegrationLinkDAO, "isLinked">;
  creator: Pick<ConnectionRepositoryCreator, "create">;
}

/**
 * POST /:projectId/repositories: creates a repository for a space with one of
 * its code host connections. Saving it as the space's repository is the
 * scm-config route's job, the same as for an existing one.
 */
export function registerSpaceRepositoryCreationRoutes(router: Router, { projects, links, creator }: SpaceRepositoryDependencies): void {
  router.post(
    "/:projectId/repositories",
    validateUuidParam("projectId"),
    validateNewConnectionRepository,
    asyncRoute(async (req, res) => {
      const project = await projects.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (project.backingKind === "files") {
        return res.status(409).json({ error: "Files spaces don't have a repository." });
      }
      const { integrationId, integrationCredentialId, owner, name } = req.body;
      if (!(await links.isLinked(project.id, integrationId))) {
        return res.status(409).json({ error: "Link the code host to this space before creating a repository with it." });
      }
      const created = await creator.create(integrationId, integrationCredentialId ?? null, { owner, name });
      res.status(201).json({ success: true, data: created });
    }),
  );
}
