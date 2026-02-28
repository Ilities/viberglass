import express from "express";
import type { Clanker } from "@viberglass/types";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { ClankerHealthService } from "../../services/ClankerHealthService";
import { getClankerProvisioner } from "../../provisioning/provisioningFactory";
import {
  validateCreateClanker,
  validateUpdateClanker,
  validateUuidParam,
} from "../middleware/validation";
import { requireAuth } from "../middleware/authentication";
import logger from "../../config/logger";
import {
  buildNativeAgentConfigTemplate,
  validateClankerConfigFiles,
} from "../../services/clanker-config-files/nativeAgentConfig";

const router = express.Router();
const clankerService = new ClankerDAO();
const healthService = new ClankerHealthService();
const provisioningService = getClankerProvisioner();

router.use(requireAuth);

async function refreshClankerStatus(clanker: Clanker): Promise<Clanker> {
  if (clanker.status === "deploying") {
    return clanker;
  }

  const availability =
    await provisioningService.resolveAvailabilityStatus(clanker);
  const currentMessage = clanker.statusMessage ?? null;
  const nextMessage = availability.statusMessage ?? null;

  if (availability.status === clanker.status && currentMessage === nextMessage) {
    return clanker;
  }

  return clankerService.updateStatus(
    clanker.id,
    availability.status,
    nextMessage,
  );
}

function toConfigFileInputs(clanker: Clanker) {
  return clanker.configFiles.map((file) => ({
    fileType: file.fileType,
    content: file.content,
  }));
}

// GET /api/clankers - List all clankers
router.get("/", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const clankers = await clankerService.listClankers(limit, offset);
    const refreshed = await Promise.all(
      clankers.map((clanker) => refreshClankerStatus(clanker)),
    );

    res.json({
      success: true,
      data: refreshed,
      pagination: { limit, offset, count: refreshed.length },
    });
  } catch (error) {
    logger.error('Error fetching clankers', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/clankers/by-slug/:slug - Get a clanker by slug
router.get("/by-slug/:slug", async (req, res) => {
  try {
    const clanker = await clankerService.getClankerBySlug(req.params.slug);
    if (!clanker) {
      return res.status(404).json({ error: "Clanker not found" });
    }
    const refreshed = await refreshClankerStatus(clanker);
    res.json({ success: true, data: refreshed });
  } catch (error) {
    logger.error('Error fetching clanker', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/native-config-template", async (req, res) => {
  try {
    const rawAgent = typeof req.query.agent === "string" ? req.query.agent : null;
    const clankerId =
      typeof req.query.clankerId === "string" ? req.query.clankerId : null;

    let clanker: Clanker | null = null;
    if (clankerId) {
      clanker = await clankerService.getClanker(clankerId);
      if (!clanker) {
        return res.status(404).json({ error: "Clanker not found" });
      }
    }

    const template = buildNativeAgentConfigTemplate(
      rawAgent ?? clanker?.agent ?? null,
      clanker,
    );
    if (!template) {
      return res.status(400).json({
        error: "Unsupported agent",
        message:
          "Native config templates are only available for supported tool-backed agents.",
      });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    logger.error("Error generating native config template", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/clankers - Create a new clanker
router.post("/", validateCreateClanker, async (req, res) => {
  try {
    validateClankerConfigFiles(req.body.agent, req.body.configFiles || []);

    // Validate that secrets exist if secretIds are provided
    if (req.body.secretIds && req.body.secretIds.length > 0) {
      try {
        await clankerService.validateSecretsExist(req.body.secretIds);
      } catch (validationError) {
        return res.status(400).json({
          error: "Validation error",
          message:
            validationError instanceof Error
              ? validationError.message
              : "Invalid secret IDs",
        });
      }
    }

    const clanker = await clankerService.createClanker(req.body);
    res.status(201).json({ success: true, data: clanker });
  } catch (error) {
    logger.error('Error creating clanker', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/clankers/:id - Get a specific clanker
router.get("/:id", validateUuidParam("id"), async (req, res) => {
  try {
    const clanker = await clankerService.getClanker(req.params.id);
    if (!clanker) {
      return res.status(404).json({ error: "Clanker not found" });
    }
    const refreshed = await refreshClankerStatus(clanker);
    res.json({ success: true, data: refreshed });
  } catch (error) {
    logger.error('Error fetching clanker', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/clankers/:id - Update a clanker
router.put(
  "/:id",
  validateUuidParam("id"),
  validateUpdateClanker,
  async (req, res) => {
    try {
      const clanker = await clankerService.getClanker(req.params.id);
      if (!clanker) {
        return res.status(404).json({ error: "Clanker not found" });
      }

      validateClankerConfigFiles(
        req.body.agent ?? clanker.agent,
        req.body.configFiles ?? toConfigFileInputs(clanker),
      );

      // Validate that secrets exist if secretIds are provided
      if (req.body.secretIds && req.body.secretIds.length > 0) {
        try {
          await clankerService.validateSecretsExist(req.body.secretIds);
        } catch (validationError) {
          return res.status(400).json({
            error: "Validation error",
            message:
              validationError instanceof Error
                ? validationError.message
                : "Invalid secret IDs",
          });
        }
      }

      const updatedClanker = await clankerService.updateClanker(
        req.params.id,
        req.body
      );
      const refreshed = await refreshClankerStatus(updatedClanker);
      res.json({ success: true, data: refreshed });
    } catch (error) {
      logger.error('Error updating clanker', { error: error instanceof Error ? error.message : error });
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/clankers/:id - Delete a clanker
router.delete("/:id", validateUuidParam("id"), async (req, res) => {
  try {
    const clanker = await clankerService.getClanker(req.params.id);
    if (!clanker) {
      return res.status(404).json({ error: "Clanker not found" });
    }

    await clankerService.deleteClanker(req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting clanker', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/clankers/:id/start - Start a clanker
router.post("/:id/start", validateUuidParam("id"), async (req, res) => {
  try {
    const clanker = await clankerService.getClanker(req.params.id);
    if (!clanker) {
      return res.status(404).json({ error: "Clanker not found" });
    }

    if (clanker.status === "active") {
      return res.status(400).json({ error: "Clanker is already active" });
    }
    if (clanker.status === "deploying") {
      return res.status(409).json({ error: "Clanker is already deploying" });
    }

    const preflightError =
      provisioningService.getProvisioningPreflightError(clanker);
    if (preflightError) {
      return res.status(400).json({
        error: "Provisioning configuration error",
        message: preflightError,
      });
    }

    // Update status to deploying first
    const updatedClanker = await clankerService.updateStatus(
      req.params.id,
      "deploying",
      "Starting clanker..."
    );

    // Run provisioning asynchronously so UI can observe progress updates.
    void (async () => {
      try {
        const provisioned = await provisioningService.provision(
          updatedClanker,
          async (statusMessage) => {
            try {
              await clankerService.updateStatus(
                updatedClanker.id,
                "deploying",
                statusMessage,
              );
            } catch (statusError) {
              logger.warn("Failed to persist clanker provisioning progress", {
                clankerId: updatedClanker.id,
                statusMessage,
                error:
                  statusError instanceof Error
                    ? statusError.message
                    : String(statusError),
              });
            }
          },
        );

        await clankerService.updateClanker(updatedClanker.id, {
          deploymentConfig:
            provisioned.deploymentConfig ??
            updatedClanker.deploymentConfig ??
            null,
          status: provisioned.status,
          statusMessage: provisioned.statusMessage ?? null,
        });
      } catch (provisioningError) {
        const message =
          provisioningError instanceof Error
            ? provisioningError.message
            : "Provisioning failed";
        await clankerService.updateStatus(updatedClanker.id, "failed", message);
        logger.error("Failed to provision clanker resources", {
          clankerId: updatedClanker.id,
          error: message,
        });
      }
    })();

    res.status(202).json({ success: true, data: updatedClanker });
  } catch (error) {
    logger.error('Error starting clanker', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

const deactivateClankerHandler = async (
  req: express.Request,
  res: express.Response,
) => {
  try {
    const clanker = await clankerService.getClanker(req.params.id);
    if (!clanker) {
      return res.status(404).json({ error: "Clanker not found" });
    }

    if (clanker.status === "inactive") {
      return res.status(400).json({ error: "Clanker is already inactive" });
    }

    const deprovisioned = await provisioningService.deprovision(clanker);
    const statusMessage = deprovisioned.statusMessage ?? "Deactivated by user";

    const updatedClanker =
      deprovisioned.deploymentConfig !== undefined
        ? await clankerService.updateClanker(req.params.id, {
            deploymentConfig: deprovisioned.deploymentConfig,
            status: "inactive",
            statusMessage,
          })
        : await clankerService.updateStatus(
            req.params.id,
            "inactive",
            statusMessage,
          );

    res.json({ success: true, data: updatedClanker });
  } catch (error) {
    logger.error('Error deactivating clanker', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /api/clankers/:id/deactivate - Deactivate a clanker
router.post(
  "/:id/deactivate",
  validateUuidParam("id"),
  deactivateClankerHandler,
);

// POST /api/clankers/:id/stop - Backward-compatible alias for deactivation
router.post("/:id/stop", validateUuidParam("id"), deactivateClankerHandler);

// GET /api/clankers/:id/health - Get clanker health status
router.get('/:id/health', validateUuidParam('id'), async (req, res) => {
  try {
    const clanker = await clankerService.getClanker(req.params.id);
    if (!clanker) {
      return res.status(404).json({ error: 'Clanker not found' });
    }

    const refreshed = await refreshClankerStatus(clanker);
    const health = await healthService.checkClankerHealth(refreshed);
    res.json({ success: true, data: health });
  } catch (error) {
    logger.error('Error checking clanker health', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Config file management routes

// GET /api/clankers/:id/config-files - Get all config files for a clanker
router.get("/:id/config-files", validateUuidParam("id"), async (req, res) => {
  try {
    const clanker = await clankerService.getClanker(req.params.id);
    if (!clanker) {
      return res.status(404).json({ error: "Clanker not found" });
    }

    const configFiles = await clankerService.getConfigFiles(req.params.id);
    res.json({ success: true, data: configFiles });
  } catch (error) {
    logger.error('Error fetching config files', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/clankers/:id/config-files/:fileType - Get a specific config file
router.get(
  "/:id/config-files/:fileType",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const clanker = await clankerService.getClanker(req.params.id);
      if (!clanker) {
        return res.status(404).json({ error: "Clanker not found" });
      }

      const configFile = await clankerService.getConfigFile(
        req.params.id,
        req.params.fileType
      );
      if (!configFile) {
        return res.status(404).json({ error: "Config file not found" });
      }

      res.json({ success: true, data: configFile });
    } catch (error) {
      logger.error('Error fetching config file', { error: error instanceof Error ? error.message : error });
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/clankers/:id/config-files/:fileType - Delete a specific config file
router.delete(
  "/:id/config-files/:fileType",
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const clanker = await clankerService.getClanker(req.params.id);
      if (!clanker) {
        return res.status(404).json({ error: "Clanker not found" });
      }

      await clankerService.deleteConfigFile(req.params.id, req.params.fileType);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting config file', { error: error instanceof Error ? error.message : error });
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
