import express from "express";
import { DeploymentStrategyDAO } from "../../persistence/clanker/DeploymentStrategyDAO";
import {
  validateCreateDeploymentStrategy,
  validateUpdateDeploymentStrategy,
  validateUuidParam,
} from "../middleware/validation";
import logger from "../../config/logger";

const router = express.Router();
const deploymentStrategyService = new DeploymentStrategyDAO();

// GET /api/deployment-strategies - List all deployment strategies
router.get("/", async (req, res) => {
  try {
    const strategies = await deploymentStrategyService.listDeploymentStrategies();

    res.json({
      success: true,
      data: strategies,
    });
  } catch (error) {
    logger.error('Error fetching deployment strategies', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/deployment-strategies/by-name/:name - Get a deployment strategy by name
router.get("/by-name/:name", async (req, res) => {
  try {
    const strategy = await deploymentStrategyService.getDeploymentStrategyByName(
      req.params.name
    );
    if (!strategy) {
      return res.status(404).json({ error: "Deployment strategy not found" });
    }
    res.json({ success: true, data: strategy });
  } catch (error) {
    logger.error('Error fetching deployment strategy', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/deployment-strategies - Create a new deployment strategy
router.post("/", validateCreateDeploymentStrategy, async (req, res) => {
  try {
    const strategy = await deploymentStrategyService.createDeploymentStrategy(
      req.body
    );
    res.status(201).json({ success: true, data: strategy });
  } catch (error) {
    logger.error('Error creating deployment strategy', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/deployment-strategies/:id - Get a specific deployment strategy
router.get("/:id", validateUuidParam("id"), async (req, res) => {
  try {
    const strategy = await deploymentStrategyService.getDeploymentStrategy(
      req.params.id
    );
    if (!strategy) {
      return res.status(404).json({ error: "Deployment strategy not found" });
    }
    res.json({ success: true, data: strategy });
  } catch (error) {
    logger.error('Error fetching deployment strategy', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/deployment-strategies/:id - Update a deployment strategy
router.put(
  "/:id",
  validateUuidParam("id"),
  validateUpdateDeploymentStrategy,
  async (req, res) => {
    try {
      const strategy = await deploymentStrategyService.getDeploymentStrategy(
        req.params.id
      );
      if (!strategy) {
        return res.status(404).json({ error: "Deployment strategy not found" });
      }

      const updatedStrategy =
        await deploymentStrategyService.updateDeploymentStrategy(
          req.params.id,
          req.body
        );
      res.json({ success: true, data: updatedStrategy });
    } catch (error) {
      logger.error('Error updating deployment strategy', { error: error instanceof Error ? error.message : error });
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/deployment-strategies/:id - Delete a deployment strategy
router.delete("/:id", validateUuidParam("id"), async (req, res) => {
  try {
    const strategy = await deploymentStrategyService.getDeploymentStrategy(
      req.params.id
    );
    if (!strategy) {
      return res.status(404).json({ error: "Deployment strategy not found" });
    }

    await deploymentStrategyService.deleteDeploymentStrategy(req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting deployment strategy', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
