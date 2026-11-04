import { previewInstance, type AppHost, type AppRelease } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppPreviewChange, AppPreviewDAO, AppPreviewRecord } from "../../persistence/apps/AppPreviewDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { APP_STOP_GRACE_SECONDS } from "./appHostingConfig";
import type { AppInstanceRunner } from "./AppInstanceRunner";
import { NO_APP_HOST } from "./AppReconciler";

const logger = createChildLogger({ service: "AppPreviewReconciler" });

const BUSY_STALE_MS = 15 * 60 * 1000;

type Action =
  | { kind: "stop" }
  | { kind: "wait"; release: AppRelease | null }
  | { kind: "build_failed"; release: AppRelease | null }
  | { kind: "start"; release: AppRelease }
  | { kind: "no_host" };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Brings a preview to what was asked of it: gone when it's off, and running its
 * build with a fresh copy of the live data when it's on. Every start begins
 * from nothing, so a preview never keeps data between runs.
 */
export class AppPreviewReconciler {
  constructor(
    private readonly previews: Pick<AppPreviewDAO, "get" | "claim" | "update" | "finish">,
    private readonly releases: Pick<AppReleaseDAO, "getById">,
    private readonly host: () => AppHost | null,
    private readonly runner: Pick<AppInstanceRunner, "run">,
  ) {}

  /** Returns whether it acted. */
  async reconcile(previewId: string, now = new Date()): Promise<boolean> {
    const staleBefore = new Date(now.getTime() - BUSY_STALE_MS);
    const seen = await this.previews.get(previewId);
    if (!seen || (seen.busySince && seen.busySince > staleBefore) || !(await this.actionFor(seen))) return false;

    const preview = await this.previews.claim(previewId, staleBefore);
    if (!preview) return false;
    let outcome: AppPreviewChange = {};
    try {
      const action = await this.actionFor(preview);
      if (!action) return false;
      outcome = await this.perform(preview, action);
      return true;
    } catch (error) {
      logger.warn("Could not bring a preview to its wanted state", { previewId, error: message(error) });
      outcome = { state: "failed", statusMessage: message(error), runningReleaseId: null };
      return true;
    } finally {
      await this.previews.finish(previewId, outcome);
    }
  }

  /** Stops the preview and removes everything it had; for previews whose change ended. */
  async remove(preview: Pick<AppPreviewRecord, "id">): Promise<void> {
    await this.host()?.delete(previewInstance(preview.id));
  }

  private async actionFor(preview: AppPreviewRecord): Promise<Action | null> {
    if (preview.power === "off") return preview.state === "off" ? null : { kind: "stop" };
    if (preview.state === "failed") return null;

    const release = preview.releaseId ? await this.releases.getById(preview.releaseId) : null;
    if (!release || release.status === "failed") return { kind: "build_failed", release };
    if (release.status === "building") return preview.state === "building" ? null : { kind: "wait", release };
    if (preview.state === "running" && preview.runningReleaseId === release.id) return null;
    return this.host() ? { kind: "start", release } : { kind: "no_host" };
  }

  private async perform(preview: AppPreviewRecord, action: Action): Promise<AppPreviewChange> {
    const host = this.host();
    const instance = previewInstance(preview.id);
    switch (action.kind) {
      case "stop":
        if (host) {
          await this.previews.update(preview.id, { state: "stopping" });
          await host.delete(instance);
        }
        return { state: "off", runningReleaseId: null };
      case "wait":
        return { state: "building", statusMessage: null };
      case "build_failed":
        await host?.delete(instance);
        return {
          state: "failed",
          runningReleaseId: null,
          statusMessage: action.release?.failureReason
            ? `The preview's build failed: ${action.release.failureReason}`
            : "The preview's build is gone. Try it again.",
        };
      case "no_host":
        return { state: "failed", statusMessage: NO_APP_HOST };
      case "start":
        if (!host) return { state: "failed", statusMessage: NO_APP_HOST };
        await this.previews.update(preview.id, { state: "starting", statusMessage: null });
        // Drops the last run's data too, so this one restores from the live replica.
        await host.delete(instance);
        return this.start(host, preview, action.release, instance);
    }
  }

  private async start(host: AppHost, preview: AppPreviewRecord, release: AppRelease, instance: string): Promise<AppPreviewChange> {
    const failure = await this.runner.run(host, release, { kind: "preview", instance }).catch(message);
    if (failure) {
      await host.stop(instance, APP_STOP_GRACE_SECONDS).catch(() => undefined);
      return { state: "failed", statusMessage: failure, runningReleaseId: null };
    }
    return {
      state: "running",
      statusMessage: null,
      runningReleaseId: release.id,
      startedAt: new Date(),
      triedCommitSha: release.commitSha,
    };
  }
}
