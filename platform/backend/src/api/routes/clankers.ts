import express from "express";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import {
  validateCreateClanker,
  validateUpdateClanker,
  validateUuidParam,
} from "../middleware/validation";

const router = express.Router();
const clankerService = new ClankerDAO();

// GET /api/clankers - List all clankers
router.get("/", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const clankers = await clankerService.listClankers(limit, offset);

    res.json({
      success: true,
      data: clankers,
      pagination: { limit, offset, count: clankers.length },
    });
  } catch (error) {
    console.error("Error fetching clankers:", error);
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
    res.json({ success: true, data: clanker });
  } catch (error) {
    console.error("Error fetching clanker:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/clankers - Create a new clanker
router.post("/", validateCreateClanker, async (req, res) => {
  try {
    const clanker = await clankerService.createClanker(req.body);
    res.status(201).json({ success: true, data: clanker });
  } catch (error) {
    console.error("Error creating clanker:", error);
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
    res.json({ success: true, data: clanker });
  } catch (error) {
    console.error("Error fetching clanker:", error);
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

      const updatedClanker = await clankerService.updateClanker(
        req.params.id,
        req.body
      );
      res.json({ success: true, data: updatedClanker });
    } catch (error) {
      console.error("Error updating clanker:", error);
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
    console.error("Error deleting clanker:", error);
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

    // Update status to deploying first
    const updatedClanker = await clankerService.updateStatus(
      req.params.id,
      "deploying",
      "Starting clanker..."
    );

    // TODO: Implement actual deployment logic based on deployment strategy
    // For now, we'll just set it to active after a brief delay simulation
    setTimeout(async () => {
      try {
        await clankerService.updateStatus(req.params.id, "active", null);
      } catch (err) {
        console.error("Error setting clanker to active:", err);
        await clankerService.updateStatus(
          req.params.id,
          "failed",
          "Failed to start clanker"
        );
      }
    }, 1000);

    res.json({ success: true, data: updatedClanker });
  } catch (error) {
    console.error("Error starting clanker:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/clankers/:id/stop - Stop a clanker
router.post("/:id/stop", validateUuidParam("id"), async (req, res) => {
  try {
    const clanker = await clankerService.getClanker(req.params.id);
    if (!clanker) {
      return res.status(404).json({ error: "Clanker not found" });
    }

    if (clanker.status === "inactive") {
      return res.status(400).json({ error: "Clanker is already inactive" });
    }

    // TODO: Implement actual stop logic based on deployment strategy
    const updatedClanker = await clankerService.updateStatus(
      req.params.id,
      "inactive",
      "Stopped by user"
    );

    res.json({ success: true, data: updatedClanker });
  } catch (error) {
    console.error("Error stopping clanker:", error);
    res.status(500).json({ error: "Internal server error" });
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
    console.error("Error fetching config files:", error);
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
      console.error("Error fetching config file:", error);
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
      console.error("Error deleting config file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
