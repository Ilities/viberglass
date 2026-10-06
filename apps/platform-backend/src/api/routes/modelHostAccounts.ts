import express from "express";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../middleware/authentication";
import {
  validateModelHostAccount,
  validateUuidParam,
} from "../middleware/validation";
import {
  modelDeployments,
  modelHostAccounts,
} from "../../services/modelHosting";

const router = express.Router();
router.use(requireAuth);
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
}

router.get(
  "/",
  handle(async (_req, res) => {
    res.json({ success: true, data: await modelHostAccounts.list() });
  }),
);
router.post(
  "/",
  validateModelHostAccount,
  handle(async (req, res) => {
    res
      .status(201)
      .json({ success: true, data: await modelHostAccounts.create(req.body) });
  }),
);
router.put(
  "/:id",
  validateUuidParam("id"),
  validateModelHostAccount,
  handle(async (req, res) => {
    res.json({
      success: true,
      data: await modelHostAccounts.update(req.params.id, req.body),
    });
  }),
);
router.delete(
  "/:id",
  validateUuidParam("id"),
  handle(async (req, res) => {
    await modelHostAccounts.delete(req.params.id);
    res.status(204).send();
  }),
);
router.get(
  "/:id/flavours",
  validateUuidParam("id"),
  handle(async (req, res) => {
    res.json({
      success: true,
      data: await modelDeployments.flavours(req.params.id),
    });
  }),
);
export default router;
