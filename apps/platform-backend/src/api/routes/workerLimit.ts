import express, { type NextFunction, type Request, type Response } from "express";
import { WorkerLimitService } from "../../workers/capacity/WorkerLimitService";
import { requireAuth } from "../middleware/authentication";
import { validateWorkerLimit } from "../middleware/validation";

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/** How many Kubernetes workers may run at once. Who may change it is decided where it's mounted. */
export function createWorkerLimitRouter(limit: Pick<WorkerLimitService, "status" | "set"> = new WorkerLimitService()) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", (_req, res) => {
    res.json({ success: true, data: limit.status() });
  });

  router.put("/", validateWorkerLimit, asyncRoute(async (req, res) => {
    res.json({ success: true, data: await limit.set(req.body.maxRuns, req.authContext?.user.id ?? null) });
  }));

  return router;
}
