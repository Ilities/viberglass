import express from "express";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../middleware/authentication";
import {
  validateModelEndpoint,
  validateUuidParam,
} from "../middleware/validation";
import {
  modelEndpoints,
  modelEndpointChecker,
} from "../../services/modelEndpoints";

const router = express.Router();
router.use(requireAuth);
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
}

router.get(
  "/",
  handle(async (_req, res) => {
    res.json({ success: true, data: await modelEndpoints.list() });
  }),
);
router.post(
  "/check",
  validateModelEndpoint,
  handle(async (req, res) => {
    await modelEndpoints.validate(req.body);
    res.json({
      success: true,
      data: await modelEndpointChecker.check(req.body),
    });
  }),
);
router.post(
  "/",
  validateModelEndpoint,
  handle(async (req, res) => {
    res
      .status(201)
      .json({ success: true, data: await modelEndpoints.create(req.body) });
  }),
);
router.put(
  "/:id",
  validateUuidParam("id"),
  validateModelEndpoint,
  handle(async (req, res) => {
    res.json({
      success: true,
      data: await modelEndpoints.update(req.params.id, req.body),
    });
  }),
);
router.delete(
  "/:id",
  validateUuidParam("id"),
  handle(async (req, res) => {
    await modelEndpoints.delete(req.params.id);
    res.status(204).send();
  }),
);
export default router;
