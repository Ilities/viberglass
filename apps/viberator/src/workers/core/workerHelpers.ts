import * as fs from "fs";
import { Logger } from "winston";
import type { CallbackClient } from "../infrastructure/CallbackClient";

export async function sendWorkerProgress(
  client: CallbackClient,
  logger: Logger,
  jobId: string | undefined,
  tenantId: string | undefined,
  step: string,
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  if (!jobId || !tenantId) {
    return;
  }
  try {
    await client.sendProgress(jobId, tenantId, { step, message, details });
  } catch (error) {
    logger.warn("Failed to send progress update", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function cleanupJobWorkspace(logger: Logger, workDir: string): void {
  try {
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
      logger.info("Workspace cleaned up", { workDir });
    }
  } catch (error) {
    logger.warn("Failed to cleanup workspace", { workDir, error });
  }
}
