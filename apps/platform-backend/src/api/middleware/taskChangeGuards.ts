import type { NextFunction, Request, Response } from "express";
import type { TaskChange } from "@viberglass/types";
import { TaskChangePolicyService } from "../../services/tasks/TaskChangePolicyService";

type Policy = Pick<TaskChangePolicyService, "assertCanChange">;

/** For routes on one task (`:id`): the signed-in person must be allowed this change. */
export function taskChangeGuard(change: TaskChange, policy: Policy = new TaskChangePolicyService()) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.authContext?.user;
    if (!user) return next();
    policy.assertCanChange({ id: user.id, role: user.role }, req.params.id, change).then(() => next(), next);
  };
}

/** For bulk actions: every task in `req.body.ticketIds` must allow the change. */
export function tasksInBodyChangeGuard(change: TaskChange, policy: Policy = new TaskChangePolicyService()) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.authContext?.user;
    const ids: unknown = req.body?.ticketIds;
    if (!user || !Array.isArray(ids)) return next();
    const person = { id: user.id, role: user.role };
    Promise.all(ids.map((id) => (typeof id === "string" ? policy.assertCanChange(person, id, change) : undefined))).then(
      () => next(),
      next,
    );
  };
}
