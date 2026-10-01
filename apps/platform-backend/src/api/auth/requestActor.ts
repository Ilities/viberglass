import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

interface ActorContext {
  userId: string | null;
  ip: string | null;
  /** Set when the action came from Slack, linked to a person or not. */
  slackUserId?: string;
}

const actorStorage = new AsyncLocalStorage<ActorContext>();

/**
 * Remembers who made the current request and from where, so services that
 * record a task's Activity or the audit log can attribute it without every
 * call passing the person along. Mounted after authentication; requests with
 * no signed-in user (worker callbacks, webhooks, sweepers) have no actor.
 */
export function withRequestActor(req: Request, _res: Response, next: NextFunction): void {
  actorStorage.run({ userId: req.authContext?.user.id ?? null, ip: req.ip ?? null }, next);
}

/** Runs work that has no request (a Slack action) as the person behind it. */
export function runAsActor<T>(context: { userId: string | null; slackUserId?: string }, work: () => Promise<T>): Promise<T> {
  return actorStorage.run({ ...context, ip: null }, work);
}

/** The signed-in person behind the current request, if any. */
export function currentActorId(): string | null {
  return actorStorage.getStore()?.userId ?? null;
}

/** The address the current request came from, if there is a request. */
export function currentRequestIp(): string | null {
  return actorStorage.getStore()?.ip ?? null;
}

/** The Slack user behind the current action, when it came from Slack. */
export function currentSlackUserId(): string | null {
  return actorStorage.getStore()?.slackUserId ?? null;
}
