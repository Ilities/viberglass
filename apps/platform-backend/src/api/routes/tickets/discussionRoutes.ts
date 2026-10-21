import type { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { isPartRange, isTaskTurnAction, mentionsAnAgent, type MediaAsset } from "@viberglass/types";
import type { FileUploadService } from "../../../services/FileUploadService";
import type { TaskDiscussionService } from "../../../services/tasks/TaskDiscussionService";
import type { TaskTimelineService } from "../../../services/tasks/TaskTimelineService";
import type { TaskTurnService } from "../../../services/taskTurns/TaskTurnService";
import type { TaskMentionDAO } from "../../../persistence/ticketing/TaskMentionDAO";
import { validateUuidParam } from "../../middleware/validation";

export const MESSAGE_IMAGE_LIMIT = 4;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MESSAGE_IMAGE_LIMIT },
}).array("images", MESSAGE_IMAGE_LIMIT);

/** A message's images, sent as multipart `images` fields; a JSON message passes through untouched. */
function receiveImages(req: Request, res: Response, next: NextFunction): void {
  imageUpload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Each image can be up to 10 MB."
          : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE"
            ? `Attach up to ${MESSAGE_IMAGE_LIMIT} images.`
            : error.message;
      res.status(400).json({ error: message });
      return;
    }
    if (error) return next(error);
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.some((file) => !IMAGE_TYPES.has(file.mimetype))) {
      res.status(400).json({ error: "Attach PNG, JPEG, GIF or WebP images." });
      return;
    }
    next();
  });
}

/** Multipart fields are strings: a build's parts come as JSON, `add` as "true". */
function multipartValue(value: unknown, kind: "json" | "boolean"): unknown {
  if (typeof value !== "string") return value;
  if (kind === "boolean") return value === "true" ? true : value === "false" ? false : value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * A task's thread, posting to it, and being done with a mention. A message that mentions an agent, or
 * asks for an action, starts the agent's turn; who may ask for what is
 * TaskTurnService's to check. Registered on the tasks router, so its `:id`
 * guard applies; viewers are refused posting by the global guard.
 */
export function registerTaskDiscussionRoutes(
  router: Router,
  deps: {
    discussion: Pick<TaskDiscussionService, "post" | "list">;
    timeline: Pick<TaskTimelineService, "list">;
    turns: Pick<TaskTurnService, "ask">;
    mentions: Pick<TaskMentionDAO, "markDone">;
    uploads: Pick<FileUploadService, "uploadFile" | "deleteFileByStorageUrl">;
  },
): void {
  // Done with being mentioned without replying: it stops being their move.
  router.post("/:id/mentions/done", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: { done: await deps.mentions.markDone(req.params.id, req.authContext!.user.id) } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/messages", validateUuidParam("id"), receiveImages, async (req, res, next) => {
    const body: unknown = req.body?.body ?? "";
    const action: unknown = req.body?.action || undefined;
    const agentId: unknown = req.body?.agentId || undefined;
    const parts: unknown = multipartValue(req.body?.parts, "json");
    const add: unknown = multipartValue(req.body?.add, "boolean");
    const files = Array.isArray(req.files) ? req.files : [];
    if (typeof body !== "string") return res.status(400).json({ error: "body must be a string" });
    if (action !== undefined && !isTaskTurnAction(action)) return res.status(400).json({ error: "Unknown action" });
    if (agentId !== undefined && typeof agentId !== "string") return res.status(400).json({ error: "agentId must be a string" });
    if (parts !== undefined && (action !== "code" || !isPartRange(parts))) {
      return res.status(400).json({ error: "parts is a build's { first, last } range of the plan's parts" });
    }
    if (add !== undefined && (action !== "code" || typeof add !== "boolean")) {
      return res.status(400).json({ error: "add is a build's choice to go into the open pull request" });
    }
    const images: MediaAsset[] = [];
    try {
      const userId = req.authContext!.user.id;
      for (const file of files) images.push(await deps.uploads.uploadFile(file, "image"));
      if (!action && !agentId && !mentionsAnAgent(body)) {
        return res.status(201).json({ success: true, data: await deps.discussion.post(req.params.id, userId, body, images) });
      }
      const asked = await deps.turns.ask(req.params.id, userId, {
        message: body,
        action,
        agentId,
        ...(parts !== undefined ? { parts } : {}),
        ...(add === true ? { add } : {}),
        ...(images.length > 0 ? { images } : {}),
      });
      res.status(201).json({
        success: true,
        data: await deps.discussion.list(req.params.id),
        turn: { sessionId: asked.session.id, turnId: asked.currentTurn.id, jobId: asked.job.id, status: asked.job.status },
      });
    } catch (error) {
      // Nothing refers to the images of a message that wasn't posted.
      await Promise.all(images.map((image) => deps.uploads.deleteFileByStorageUrl(image.storageUrl ?? image.url).catch(() => undefined)));
      next(error);
    }
  });

  router.get("/:id/timeline", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.timeline.list(req.params.id) });
    } catch (error) {
      next(error);
    }
  });
}
