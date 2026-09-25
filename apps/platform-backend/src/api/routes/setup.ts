import express from "express";
import type { NextFunction, Request, Response } from "express";
import {
  AGENT_LABELS,
  getDefaultAgentBindingForProvider,
  MODEL_PROVIDERS,
} from "@viberglass/types";
import {
  validateSetupModelKey,
  validateSetupRepository,
  validateSetupSpace,
  validateSetupAgent,
} from "../middleware/validation";
import { requireAuth } from "../middleware/authentication";
import { SetupModelKeyService } from "../../services/setup/SetupModelKeyService";
import { SetupRepositoryService } from "../../services/setup/SetupRepositoryService";
import { SetupSpaceService } from "../../services/setup/SetupSpaceService";
import { SetupAgentService } from "../../services/setup/SetupAgentService";
import { SetupStatusService } from "../../services/setup/SetupStatusService";
import { DemoWorkspaceService } from "../../services/demo/DemoWorkspaceService";
import { isModelProviderAvailable } from "../../services/setup/modelProviderAvailability";

const router = express.Router();
const modelKeyService = new SetupModelKeyService();
const repositoryService = new SetupRepositoryService();
const spaceService = new SetupSpaceService();
const agentService = new SetupAgentService();
const statusService = new SetupStatusService();
const demoService = new DemoWorkspaceService();

router.use(requireAuth);

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    return fn(req, res, next).catch(next);
  };
}

// GET /api/setup/status - What setup has done already, so the flow can resume
router.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await statusService.getStatus() });
  }),
);

// GET /api/setup/providers - Providers the key screen offers, with the agent each key runs on
router.get("/providers", (_req, res) => {
  const providers = MODEL_PROVIDERS.flatMap((provider) => {
    const binding = getDefaultAgentBindingForProvider(provider.id);
    if (!binding || !isModelProviderAvailable(provider)) return [];
    return [
      {
        id: provider.id,
        displayName: provider.displayName,
        keyUrl: provider.keyUrl,
        keyPrefixes: provider.keyPrefixes,
        agent: binding.agent,
        agentName: AGENT_LABELS[binding.agent],
      },
    ];
  });
  res.json({ success: true, data: providers });
});

// POST /api/setup/model-key - Check a model API key with its provider and store it
router.post(
  "/model-key",
  validateSetupModelKey,
  asyncHandler(async (req, res) => {
    const saved = await modelKeyService.saveModelKey(req.body.provider, req.body.key);
    res.json({ success: true, data: saved });
  }),
);

// POST /api/setup/repository - Check a GitHub token against a repository and save it as the connection's token
router.post(
  "/repository",
  validateSetupRepository,
  asyncHandler(async (req, res) => {
    const saved = await repositoryService.saveRepository(req.body.repository, req.body.token);
    res.json({ success: true, data: saved });
  }),
);

// POST /api/setup/space - Create the first space on the connected repository
router.post(
  "/space",
  validateSetupSpace,
  asyncHandler(async (req, res) => {
    const space = await spaceService.createSpace(req.body);
    res.status(201).json({ success: true, data: space });
  }),
);

// POST /api/setup/agent - Create (or reconfigure) the default agent for the key's provider and start it.
// Progress shows on the runner's status message: GET /api/clankers/:id.
router.post(
  "/agent",
  validateSetupAgent,
  asyncHandler(async (req, res) => {
    const agent = await agentService.prepareDefaultAgent(req.body.provider);
    res.status(202).json({ success: true, data: agent });
  }),
);

// POST /api/setup/demo - Load the demo workspace beside real data (does nothing if it's already loaded)
router.post(
  "/demo",
  asyncHandler(async (_req, res) => {
    res.status(201).json({ success: true, data: await demoService.load() });
  }),
);

// DELETE /api/setup/demo - Remove exactly what the demo loaded
router.delete(
  "/demo",
  asyncHandler(async (_req, res) => {
    await demoService.remove();
    res.status(204).send();
  }),
);

export default router;
