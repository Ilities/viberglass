import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "@viberglass/mcp-server";
import { mcpToolServices } from "../../mcp/composeMcpServices";
import { requireApiToken } from "../middleware/authentication";
import logger from "../../config/logger";

const router = express.Router();

async function handleMcpRequest(
  req: express.Request,
  res: express.Response,
  parsedBody?: unknown,
) {
  const server = createMcpServer(mcpToolServices, {
    name: "viberglass",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}

router.post("/", requireApiToken, async (req, res) => {
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

router.get("/", requireApiToken, async (req, res) => {
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

router.delete("/", requireApiToken, async (req, res) => {
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
