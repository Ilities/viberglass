import { createChildLogger } from "../../config/logger";
import type { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";

const logger = createChildLogger({ service: "PreviewOpenings" });

const WRITE_EVERY_MS = 60_000;

/** Notes when each preview was last opened, for turning idle ones off, without a write per request. */
export class PreviewOpenings {
  private readonly written = new Map<string, number>();

  constructor(
    private readonly previews: Pick<AppPreviewDAO, "touch">,
    private readonly now: () => number = Date.now,
  ) {}

  opened(previewId: string): void {
    const now = this.now();
    const last = this.written.get(previewId);
    if (last !== undefined && now - last < WRITE_EVERY_MS) return;
    this.written.set(previewId, now);
    if (this.written.size > 1000) this.forgetOld(now);
    this.previews.touch(previewId, new Date(now)).catch((error: unknown) => {
      logger.warn("Could not note that a preview was opened", { previewId, error: error instanceof Error ? error.message : String(error) });
    });
  }

  private forgetOld(now: number): void {
    for (const [id, at] of this.written) if (now - at >= WRITE_EVERY_MS) this.written.delete(id);
  }
}
