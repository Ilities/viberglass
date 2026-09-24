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
} from "../middleware/validation";
import { requireAuth } from "../middleware/authentication";
import { SetupModelKeyService } from "../../services/setup/SetupModelKeyService";
import { SetupRepositoryService } from "../../services/setup/SetupRepositoryService";
import { SetupSpaceService } from "../../services/setup/SetupSpaceService";

const router = express.Router();
const modelKeyService = new SetupModelKeyService();
const repositoryService = new SetupRepositoryService();
const spaceService = new SetupSpaceService();

router.use(requireAuth);

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    return fn(req, res, next).catch(next);
  };
}

// GET /api/setup/providers - Providers the key screen offers, with the agent each key runs on
router.get("/providers", (_req, res) => {
  const providers = MODEL_PROVIDERS.flatMap((provider) => {
    const binding = getDefaultAgentBindingForProvider(provider.id);
    if (!binding) return [];
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

export default router;
