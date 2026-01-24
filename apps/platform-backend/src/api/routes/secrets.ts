import express from "express";
import {
  validateCreateSecret,
  validateUpdateSecret,
  validateUuidParam,
} from "../middleware/validation";
import { SecretService } from "../../services/SecretService";
import logger from "../../config/logger";

const router = express.Router();
const secretService = new SecretService();

const isClientError = (error: Error): boolean => {
  const message = error.message.toLowerCase();
  return (
    message.includes("required") ||
    message.includes("already exists") ||
    message.includes("invalid")
  );
};

router.get("/", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const secrets = await secretService.listSecrets(limit, offset);

    res.json({
      success: true,
      data: secrets,
      pagination: { limit, offset, count: secrets.length },
    });
  } catch (error) {
    logger.error("Error listing secrets", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", validateUuidParam("id"), async (req, res) => {
  try {
    const secret = await secretService.getSecret(req.params.id);
    if (!secret) {
      return res.status(404).json({ error: "Secret not found" });
    }
    res.json({ success: true, data: secret });
  } catch (error) {
    logger.error("Error fetching secret", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", validateCreateSecret, async (req, res) => {
  try {
    const secret = await secretService.createSecret(req.body);
    res.status(201).json({ success: true, data: secret });
  } catch (error) {
    const err = error as Error;
    logger.error("Error creating secret", { error: err.message });
    res.status(isClientError(err) ? 400 : 500).json({ error: err.message });
  }
});

router.put(
  "/:id",
  validateUuidParam("id"),
  validateUpdateSecret,
  async (req, res) => {
    try {
      const existing = await secretService.getSecret(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Secret not found" });
      }

      const secret = await secretService.updateSecret(req.params.id, req.body);
      res.json({ success: true, data: secret });
    } catch (error) {
      const err = error as Error;
      logger.error("Error updating secret", { error: err.message });
      res.status(isClientError(err) ? 400 : 500).json({ error: err.message });
    }
  },
);

router.delete("/:id", validateUuidParam("id"), async (req, res) => {
  try {
    const existing = await secretService.getSecret(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Secret not found" });
    }

    await secretService.deleteSecret(req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting secret", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
