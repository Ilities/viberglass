import express from "express";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../middleware/authentication";
import {
  validateModelDeployment,
  validateModelDeploymentMode,
  validateUuidParam,
} from "../middleware/validation";
import {
  modelDeployments,
  modelRecipes,
  modelSizes,
} from "../../services/modelHosting";

const router = express.Router();
router.use(requireAuth);
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
}
const RECIPE_PART = /^[\w.-]+$/;
function recipeModel(req: Request, res: Response): string | null {
  const { org, name } = req.params;
  if (RECIPE_PART.test(org) && RECIPE_PART.test(name)) return `${org}/${name}`;
  res.status(400).json({ success: false, error: "Invalid model id" });
  return null;
}

router.get(
  "/",
  handle(async (_req, res) => {
    res.json({ success: true, data: await modelDeployments.list() });
  }),
);
router.get(
  "/recipes",
  handle(async (_req, res) => {
    res.json({ success: true, data: await modelRecipes.list() });
  }),
);
router.get(
  "/recipes/:org/:name",
  handle(async (req, res) => {
    const model = recipeModel(req, res);
    if (model) res.json({ success: true, data: await modelRecipes.get(model) });
  }),
);
router.get(
  "/recipes/:org/:name/hardware/:hardware",
  handle(async (req, res) => {
    const model = recipeModel(req, res);
    if (!model) return;
    if (!RECIPE_PART.test(req.params.hardware)) {
      res.status(400).json({ success: false, error: "Invalid hardware" });
      return;
    }
    res.json({
      success: true,
      data: await modelRecipes.command(model, req.params.hardware),
    });
  }),
);
router.get(
  "/model-size/:org/:name",
  handle(async (req, res) => {
    const model = recipeModel(req, res);
    if (model) res.json({ success: true, data: { weightsGb: await modelSizes.weightsGb(model) } });
  }),
);
router.post(
  "/",
  validateModelDeployment,
  handle(async (req, res) => {
    res
      .status(201)
      .json({ success: true, data: await modelDeployments.create(req.body) });
  }),
);
router.post(
  "/:id/mode",
  validateUuidParam("id"),
  validateModelDeploymentMode,
  handle(async (req, res) => {
    await modelDeployments.setMode(req.params.id, req.body.mode);
    res.status(204).send();
  }),
);
router.delete(
  "/:id",
  validateUuidParam("id"),
  handle(async (req, res) => {
    await modelDeployments.delete(req.params.id);
    res.status(204).send();
  }),
);
export default router;
