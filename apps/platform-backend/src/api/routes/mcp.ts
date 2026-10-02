import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "@viberglass/mcp-server";
import { createMcpToolServices, type McpScope } from "../../mcp/composeMcpServices";
import { SpaceAccessService } from "../../services/spaces/SpaceAccessService";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";
import { requireApiToken } from "../middleware/authentication";
import { refuseNonRunnerRoles } from "../middleware/workspaceRoleGuards";
import { withRequestActor } from "../auth/requestActor";
import logger from "../../config/logger";

const router = express.Router();
const spaceAccess = new SpaceAccessService();
const owners = new SpaceOwnershipDAO();

/** The spaces this caller's token may reach: the same visibility as their user. */
async function scopeFor(req: express.Request): Promise<McpScope> {
  const viewer = spaceViewerOf(req)!;
  return {
    projectIds: await spaceAccess.visibleProjectIds(viewer),
    assertSpace: async (projectId) => {
      await spaceAccess.assertCanSee(viewer, projectId);
    },
    assertTask: async (ticketId) => {
      const projectId = await owners.projectIdForTask(ticketId);
      if (projectId) await spaceAccess.assertCanSee(viewer, projectId);
    },
  };
}

async function handleMcpRequest(
  req: express.Request,
  res: express.Response,
  parsedBody?: unknown,
) {
  const server = createMcpServer(createMcpToolServices(await scopeFor(req)), {
    name: "viberglass",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}

router.post("/", requireApiToken, refuseNonRunnerRoles, withRequestActor, async (req, res) => {
  try {
    await handleMcpRequest(req, res, req.body);
  } catch (error) {
    logger.error("MCP POST request error", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/", requireApiToken, refuseNonRunnerRoles, async (req, res) => {
  try {
    await handleMcpRequest(req, res);
  } catch (error) {
    logger.error("MCP GET request error", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.delete("/", requireApiToken, refuseNonRunnerRoles, async (req, res) => {
  try {
    await handleMcpRequest(req, res);
  } catch (error) {
    logger.error("MCP DELETE request error", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

logger.info("MCP server mounted at /api/mcp (Streamable HTTP transport, stateless per-request)");

export default router;
