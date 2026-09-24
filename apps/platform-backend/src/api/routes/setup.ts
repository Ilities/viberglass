import express from "express";
import type { NextFunction, Request, Response } from "express";
import {
  AGENT_LABELS,
  getDefaultAgentBindingForProvider,
  MODEL_PROVIDERS,
} from "@viberglass/types";
import { validateSetupModelKey } from "../middleware/validation";
import { requireAuth } from "../middleware/authentication";
import { SetupModelKeyService } from "../../services/setup/SetupModelKeyService";

const router = express.Router();
const modelKeyService = new SetupModelKeyService();

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

export default router;
