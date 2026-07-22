import express from "express";
import { requireAuth } from "../middleware/authentication";
import {
  validateCreateApiToken,
  validateUuidParam,
} from "../middleware/validation";
import {
  ApiTokenDAO,
  generateApiToken,
  type CreateApiTokenResult,
} from "../../persistence/apiToken/ApiTokenDAO";
import logger from "../../config/logger";

const router = express.Router();
const apiTokenDao = new ApiTokenDAO();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const userId = req.authContext!.user.id;
    const tokens = await apiTokenDao.listByUser(userId);
    res.json({ success: true, data: tokens });
  } catch (error) {
    logger.error("Error listing API tokens", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", validateCreateApiToken, async (req, res) => {
  try {
    const userId = req.authContext!.user.id;
    const { name, expiresAt } = req.body as {
      name: string;
      expiresAt?: string | null;
    };

    const { token, tokenHash, tokenPrefix } = generateApiToken();

    const record = await apiTokenDao.create({
      userId,
      name,
      tokenHash,
      tokenPrefix,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    const result: CreateApiTokenResult = {
      id: record.id,
      name: record.name,
      token,
      tokenPrefix: record.tokenPrefix,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    logger.error("Error creating API token", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", validateUuidParam("id"), async (req, res) => {
  try {
    const userId = req.authContext!.user.id;
    const deleted = await apiTokenDao.deleteById(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ error: "API token not found" });
    }
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting API token", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
