import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

const actorStorage = new AsyncLocalStorage<{ userId: string }>();

/**
 * Remembers who made the current request, so services that record a task's
 * Activity can attribute it without every call passing the person along.
 * Mounted after authentication; requests with no signed-in user (worker
 * callbacks, webhooks, sweepers) have no actor.
 */
export function withRequestActor(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.authContext?.user.id;
  if (!userId) {
    next();
    return;
  }
  actorStorage.run({ userId }, next);
}

/** The signed-in person behind the current request, if any. */
export function currentActorId(): string | null {
  return actorStorage.getStore()?.userId ?? null;
}
