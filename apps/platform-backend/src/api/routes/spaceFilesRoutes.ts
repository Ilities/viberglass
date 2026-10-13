import type { Request, Response, Router } from "express";
import multer from "multer";
import { isObjectRecord, SPACE_UPLOAD_MAX_BYTES } from "@viberglass/types";
import logger from "../../config/logger";
import { ArtifactNotFound, type ArtifactService } from "../../services/artifacts/ArtifactService";
import { InvalidSpaceArchive } from "../../services/spaceFiles/inspectSpaceArchive";
import { SpaceFileError, type SpaceFilesEditService } from "../../services/spaceFiles/SpaceFilesEditService";
import { validateUuidParam } from "../middleware/validation";
import { requireRunnerRole } from "../middleware/workspaceRoleGuards";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SPACE_UPLOAD_MAX_BYTES, files: 1 } }).single("file");

const STATUS: Record<SpaceFileError["code"], number> = {
  FILE_CHANGED: 409,
  CHANGE_NOT_FOUND: 404,
  FILE_NOT_FOUND: 404,
  INVALID_PATH: 400,
  NOT_TEXT: 409,
};

function fail(res: Response, error: unknown, what: string): Response {
  if (error instanceof SpaceFileError) return res.status(STATUS[error.code]).json({ error: error.message, code: error.code });
  if (error instanceof InvalidSpaceArchive) return res.status(422).json({ error: error.message });
  if (error instanceof ArtifactNotFound) return res.status(404).json({ error: error.message });
  logger.error(`Could not ${what}`, { error: error instanceof Error ? error.message : String(error) });
  return res.status(500).json({ error: `Could not ${what}` });
}

function sendFile(res: Response, file: { filename: string; contentType: string; content: Buffer }): void {
  res
    .status(200)
    .set({
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    })
    .send(file.content);
}

const userId = (req: Request) => req.authContext!.user.id;

/** A Files space's working files and its artifacts. Reading needs only to see the space; changing files needs a runner role. */
export function registerSpaceFilesRoutes(router: Router, files: SpaceFilesEditService, artifacts: ArtifactService): void {
  router.get("/:projectId/files", validateUuidParam("projectId"), async (req, res) => {
    try {
      return res.json({ success: true, data: await files.list(req.params.projectId) });
    } catch (error) {
      return fail(res, error, "list the space's files");
    }
  });

  router.get("/:projectId/files/text", validateUuidParam("projectId"), async (req, res) => {
    try {
      return res.json({ success: true, data: await files.readText(req.params.projectId, req.query.path) });
    } catch (error) {
      return fail(res, error, "open the file");
    }
  });

  router.put("/:projectId/files/text", validateUuidParam("projectId"), requireRunnerRole, async (req, res) => {
    const body: unknown = req.body;
    if (!isObjectRecord(body) || typeof body.path !== "string" || typeof body.content !== "string" || !(body.baseSha256 === null || typeof body.baseSha256 === "string")) {
      return res.status(400).json({ error: "path, content and baseSha256 are required" });
    }
    try {
      const data = await files.saveText(req.params.projectId, userId(req), { path: body.path, content: body.content, baseSha256: body.baseSha256 });
      return res.status("queued" in data ? 202 : 200).json({ success: true, data });
    } catch (error) {
      return fail(res, error, "save the file");
    }
  });

  router.post("/:projectId/files", validateUuidParam("projectId"), requireRunnerRole, (req, res) => {
    upload(req, res, async (uploadError: unknown) => {
      if (uploadError) {
        const tooLarge = isObjectRecord(uploadError) && uploadError.code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? "The file is larger than 25 MiB." : "Upload one file as `file`." });
      }
      if (!req.file) return res.status(400).json({ error: "Upload one file as `file`." });
      try {
        const path = typeof req.body?.path === "string" && req.body.path.trim() ? req.body.path : req.file.originalname;
        const data = await files.upload(req.params.projectId, userId(req), path, req.file.buffer);
        return res.status("queued" in data ? 202 : 201).json({ success: true, data });
      } catch (error) {
        return fail(res, error, "upload the file");
      }
    });
  });

  router.delete("/:projectId/files", validateUuidParam("projectId"), requireRunnerRole, async (req, res) => {
    try {
      const data = await files.remove(req.params.projectId, userId(req), req.query.path);
      return res.status("queued" in data ? 202 : 200).json({ success: true, data });
    } catch (error) {
      return fail(res, error, "delete the file");
    }
  });

  router.get("/:projectId/files/changes/:changeId/content", validateUuidParam("projectId"), validateUuidParam("changeId"), async (req, res) => {
    try {
      const file = await files.changeContent(req.params.projectId, req.params.changeId);
      sendFile(res, { filename: file.path.split("/").pop() ?? "file", contentType: file.contentType, content: file.content });
    } catch (error) {
      fail(res, error, "download the change");
    }
  });

  router.delete(
    "/:projectId/files/changes/:changeId",
    validateUuidParam("projectId"),
    validateUuidParam("changeId"),
    requireRunnerRole,
    async (req, res) => {
      try {
        await files.dismissChange(req.params.projectId, req.params.changeId);
        return res.json({ success: true, data: null });
      } catch (error) {
        return fail(res, error, "dismiss the change");
      }
    },
  );

  router.get("/:projectId/files/download", validateUuidParam("projectId"), async (req, res) => {
    try {
      const file = await files.download(req.params.projectId, req.query.path);
      sendFile(res, { filename: file.path.split("/").pop() ?? "file", contentType: file.contentType, content: file.content });
    } catch (error) {
      fail(res, error, "download the file");
    }
  });

  router.get("/:projectId/artifacts", validateUuidParam("projectId"), async (req, res) => {
    try {
      return res.json({ success: true, data: await artifacts.list(req.params.projectId) });
    } catch (error) {
      return fail(res, error, "list the artifacts");
    }
  });

  router.get("/:projectId/artifacts/:artifactId", validateUuidParam("projectId"), validateUuidParam("artifactId"), async (req, res) => {
    try {
      return res.json({ success: true, data: await artifacts.detail(req.params.projectId, req.params.artifactId) });
    } catch (error) {
      return fail(res, error, "load the artifact");
    }
  });

  router.get(
    "/:projectId/artifacts/:artifactId/versions/:versionId/preview",
    validateUuidParam("projectId"),
    validateUuidParam("artifactId"),
    validateUuidParam("versionId"),
    async (req, res) => {
      try {
        res.setHeader("Cache-Control", "no-store");
        return res.json({ success: true, data: await artifacts.preview(req.params.projectId, req.params.artifactId, req.params.versionId) });
      } catch (error) {
        return fail(res, error, "preview the artifact");
      }
    },
  );

  router.get(
    "/:projectId/artifacts/:artifactId/versions/:versionId/download",
    validateUuidParam("projectId"),
    validateUuidParam("artifactId"),
    validateUuidParam("versionId"),
    async (req, res) => {
      try {
        sendFile(res, await artifacts.download(req.params.projectId, req.params.artifactId, req.params.versionId));
      } catch (error) {
        fail(res, error, "download the artifact");
      }
    },
  );
}
