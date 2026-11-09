import { createChildLogger } from "../../config/logger";
import type { AppPreviewDAO, AppPreviewRecord } from "../../persistence/apps/AppPreviewDAO";
import { keepPreviewsOn, previewIdleMs, previewOffHour } from "./appHostingConfig";
import type { AppPreviewReconciler } from "./AppPreviewReconciler";

const logger = createChildLogger({ service: "AppPreviewSweep" });

type Env = Record<string, string | undefined>;

/** The latest time at or before `now` when the clock read `hour`:00 UTC. */
export function lastNightlyOff(now: Date, hour: number): Date {
  const boundary = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
  if (boundary > now) boundary.setUTCDate(boundary.getUTCDate() - 1);
  return boundary;
}

/** Why a running preview should be turned off now, or null. */
export function turnOffReason(preview: Pick<AppPreviewRecord, "state" | "startedAt" | "lastOpenedAt">, now: Date, env: Env): string | null {
  if (preview.state !== "running" || !preview.startedAt || keepPreviewsOn(env)) return null;
  if (preview.startedAt < lastNightlyOff(now, previewOffHour(env))) return "Turned off for the night. Try it to turn it on again.";
  const idleMs = previewIdleMs(env);
  const lastUsed = Math.max(preview.startedAt.getTime(), preview.lastOpenedAt?.getTime() ?? 0);
  if (now.getTime() - lastUsed >= idleMs) {
    return `Turned off after ${Math.round(idleMs / 3_600_000)} hours without being opened. Try it to turn it on again.`;
  }
  return null;
}

/**
 * Looks at every preview: previews of changes that ended are removed, idle ones
 * and every one at night are turned off, and the rest get to what was asked.
 */
export class AppPreviewSweep {
  constructor(
    private readonly previews: Pick<AppPreviewDAO, "listEnded" | "listActive" | "update" | "delete">,
    private readonly reconciler: Pick<AppPreviewReconciler, "reconcile" | "remove">,
    private readonly env: () => Env = () => process.env,
  ) {}

  /** Returns how many previews it acted on. */
  async sweep(now: Date): Promise<number> {
    let acted = 0;
    for (const preview of await this.previews.listEnded()) {
      try {
        if (await this.removeEnded(preview)) acted++;
      } catch (error) {
        logger.warn("Could not remove a preview of a change that ended", { previewId: preview.id, error: message(error) });
      }
    }

    const active = await this.previews.listActive();
    const results = await Promise.all(active.map(async (preview) => {
      const reason = preview.power === "on" ? turnOffReason(preview, now, this.env()) : null;
      if (reason) await this.previews.update(preview.id, { power: "off", statusMessage: reason });
      return this.reconciler.reconcile(preview.id, now);
    }));
    return acted + results.filter(Boolean).length;
  }

  /** Turned off first, so a start in progress finishes before its instance is removed. */
  private async removeEnded(preview: AppPreviewRecord): Promise<boolean> {
    if (preview.power === "on") {
      await this.previews.update(preview.id, { power: "off" });
      return true;
    }
    if (preview.state !== "off" || preview.busySince) return false;
    await this.reconciler.remove(preview);
    await this.previews.delete(preview.id);
    return true;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
