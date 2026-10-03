import express from "express";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../middleware/authentication";
import { validateMcpServer, validateUuidParam } from "../middleware/validation";
import { McpServerService } from "../../services/mcpServers/McpServerService";

const router = express.Router();
const mcpServers = new McpServerService();

router.use(requireAuth);

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

// GET /api/mcp-servers - The workspace's approved MCP servers
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await mcpServers.list() });
  }),
);

router.post(
  "/",
  validateMcpServer,
  asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await mcpServers.create(req.body) });
  }),
);

router.put(
  "/:id",
  validateUuidParam("id"),
  validateMcpServer,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await mcpServers.update(req.params.id, req.body) });
  }),
);

router.delete(
  "/:id",
  validateUuidParam("id"),
  asyncHandler(async (req, res) => {
    await mcpServers.delete(req.params.id);
    res.status(204).send();
  }),
);

export default router;
