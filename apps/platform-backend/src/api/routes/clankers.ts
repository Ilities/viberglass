import express from "express";
import type { Request, Response, NextFunction } from "express";
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
  ClankerServiceError,
  CLANKER_SERVICE_ERROR_CODE,
} from "../../services/errors/ClankerServiceError";

const router = express.Router();
const clankerService = new ClankerDAO();
const healthService = new ClankerHealthService();
const provisioningService = getClankerProvisioner();

router.use(requireAuth);

/**
 * Wraps an async route handler so thrown errors propagate to Express error middleware.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    return fn(req, res, next).catch(next);
  };
}

async function requireClanker(id: string): Promise<Clanker> {
  const clanker = await clankerService.getClanker(id);
  if (!clanker) {
    throw new ClankerServiceError(
      CLANKER_SERVICE_ERROR_CODE.CLANKER_NOT_FOUND,
      "Clanker not found",
    );
  }
  return clanker;
}

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

async function validateSecretIds(secretIds?: string[]): Promise<void> {
  if (!secretIds || secretIds.length === 0) return;
  try {
    await clankerService.validateSecretsExist(secretIds);
  } catch (error) {
    throw new ClankerServiceError(
      CLANKER_SERVICE_ERROR_CODE.INVALID_SECRET_IDS,
      error instanceof Error ? error.message : "Invalid secret IDs",
    );
  }
}

// GET /api/clankers - List all clankers
router.get(
  "/",
  asyncHandler(async (req, res) => {
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
  }),
);

// GET /api/clankers/by-slug/:slug - Get a clanker by slug
router.get(
  "/by-slug/:slug",
  asyncHandler(async (req, res) => {
    const clanker = await clankerService.getClankerBySlug(req.params.slug);
    if (!clanker) {
      throw new ClankerServiceError(
        CLANKER_SERVICE_ERROR_CODE.CLANKER_NOT_FOUND,
        "Clanker not found",
      );
    }
    const refreshed = await refreshClankerStatus(clanker);
    res.json({ success: true, data: refreshed });
  }),
);

// POST /api/clankers - Create a new clanker
router.post(
  "/",
  validateCreateClanker,
  asyncHandler(async (req, res) => {
    await validateSecretIds(req.body.secretIds);
    const clanker = await clankerService.createClanker(req.body);
    res.status(201).json({ success: true, data: clanker });
  }),
);

// GET /api/clankers/:id - Get a specific clanker
router.get(
  "/:id",
  validateUuidParam("id"),
  asyncHandler(async (req, res) => {
    const clanker = await requireClanker(req.params.id);
    const refreshed = await refreshClankerStatus(clanker);
    res.json({ success: true, data: refreshed });
  }),
);

// PUT /api/clankers/:id - Update a clanker
router.put(
  "/:id",
  validateUuidParam("id"),
  validateUpdateClanker,
  asyncHandler(async (req, res) => {
    await requireClanker(req.params.id);
    await validateSecretIds(req.body.secretIds);

    const updatedClanker = await clankerService.updateClanker(
      req.params.id,
      req.body,
    );
    const refreshed = await refreshClankerStatus(updatedClanker);
    res.json({ success: true, data: refreshed });
  }),
);

// DELETE /api/clankers/:id - Delete a clanker
router.delete(
  "/:id",
  validateUuidParam("id"),
  asyncHandler(async (req, res) => {
    await requireClanker(req.params.id);
    await clankerService.deleteClanker(req.params.id);
    res.status(204).send();
  }),
);

// POST /api/clankers/:id/start - Start a clanker
router.post(
  "/:id/start",
  validateUuidParam("id"),
  asyncHandler(async (req, res) => {
    const clanker = await requireClanker(req.params.id);

    if (clanker.status === "active") {
      throw new ClankerServiceError(
        CLANKER_SERVICE_ERROR_CODE.ALREADY_ACTIVE,
        "Clanker is already active",
      );
    }
    if (clanker.status === "deploying") {
      throw new ClankerServiceError(
        CLANKER_SERVICE_ERROR_CODE.ALREADY_DEPLOYING,
        "Clanker is already deploying",
      );
    }

    const preflightError =
      provisioningService.getProvisioningPreflightError(clanker);
    if (preflightError) {
      throw new ClankerServiceError(
        CLANKER_SERVICE_ERROR_CODE.PROVISIONING_CONFIG_ERROR,
        preflightError,
      );
    }

    const updatedClanker = await clankerService.updateStatus(
      req.params.id,
      "deploying",
      "Starting clanker...",
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
  }),
);

const deactivateClankerHandler = asyncHandler(async (req, res) => {
  const clanker = await requireClanker(req.params.id);

  if (clanker.status === "inactive") {
    throw new ClankerServiceError(
      CLANKER_SERVICE_ERROR_CODE.ALREADY_INACTIVE,
      "Clanker is already inactive",
    );
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
});

// POST /api/clankers/:id/deactivate - Deactivate a clanker
router.post("/:id/deactivate", validateUuidParam("id"), deactivateClankerHandler);

// POST /api/clankers/:id/stop - Backward-compatible alias for deactivation
router.post("/:id/stop", validateUuidParam("id"), deactivateClankerHandler);

// GET /api/clankers/:id/health - Get clanker health status
router.get(
  "/:id/health",
  validateUuidParam("id"),
  asyncHandler(async (req, res) => {
    const clanker = await requireClanker(req.params.id);
    const refreshed = await refreshClankerStatus(clanker);
    const health = await healthService.checkClankerHealth(refreshed);
    res.json({ success: true, data: health });
  }),
);

// GET /api/clankers/:id/config-files - Get all config files for a clanker
router.get(
  "/:id/config-files",
  validateUuidParam("id"),
  asyncHandler(async (req, res) => {
    await requireClanker(req.params.id);
    const configFiles = await clankerService.getConfigFiles(req.params.id);
    res.json({ success: true, data: configFiles });
  }),
);

// GET /api/clankers/:id/config-files/:fileType - Get a specific config file
router.get(
  "/:id/config-files/:fileType",
  validateUuidParam("id"),
  asyncHandler(async (req, res) => {
    await requireClanker(req.params.id);
    const configFile = await clankerService.getConfigFile(
      req.params.id,
      req.params.fileType,
    );
    if (!configFile) {
      throw new ClankerServiceError(
        CLANKER_SERVICE_ERROR_CODE.CONFIG_FILE_NOT_FOUND,
        "Config file not found",
      );
    }
    res.json({ success: true, data: configFile });
  }),
);

// DELETE /api/clankers/:id/config-files/:fileType - Delete a specific config file
router.delete(
  "/:id/config-files/:fileType",
  validateUuidParam("id"),
  asyncHandler(async (req, res) => {
    await requireClanker(req.params.id);
    await clankerService.deleteConfigFile(req.params.id, req.params.fileType);
    res.status(204).send();
  }),
);

export default router;
