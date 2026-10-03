import express from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { SKILL_UPLOAD_MAX_BYTES } from "@viberglass/types";
import { requireAuth } from "../middleware/authentication";
import { validateUuidParam } from "../middleware/validation";
import { SkillService, type SkillUpload } from "../../services/skills/SkillService";

const router = express.Router();
const skills = new SkillService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SKILL_UPLOAD_MAX_BYTES, files: 1 } }).single("file");

router.use(requireAuth);

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

/** Accepts one `file` field, a .zip of the skill's folder or its SKILL.md, and answers plainly when it can't. */
function receiveSkillFile(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "The file is larger than 5 MB." : error.message;
      res.status(400).json({ error: message });
      return;
    }
    if (error) return next(error);
    const name = req.file?.originalname.toLowerCase() ?? "";
    if (!req.file || !(name.endsWith(".zip") || name.endsWith(".md"))) {
      res.status(400).json({ error: "Upload a .zip of the skill's folder, or its SKILL.md." });
      return;
    }
    next();
  });
}

function uploadOf(req: Request): SkillUpload {
  if (!req.file) throw new Error("No skill file received");
  return { fileName: req.file.originalname, bytes: new Uint8Array(req.file.buffer) };
}

// GET /api/skills - The workspace's skills
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await skills.list() });
  }),
);

router.post(
  "/",
  receiveSkillFile,
  asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await skills.create(uploadOf(req)) });
  }),
);

// PUT /api/skills/:id - Upload a new version of a skill
router.put(
  "/:id",
  validateUuidParam("id"),
  receiveSkillFile,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await skills.replace(req.params.id, uploadOf(req)) });
  }),
);

router.delete(
  "/:id",
  validateUuidParam("id"),
  asyncHandler(async (req, res) => {
    await skills.delete(req.params.id);
    res.status(204).send();
  }),
);

export default router;
