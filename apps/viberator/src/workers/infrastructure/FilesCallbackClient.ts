import type {
  FilesCheckpointRequest,
  FilesCheckpointResult,
  FilesStorageGrant,
  FilesStorageOperation,
} from "@viberglass/types";
import { buildCallbackHeaders, sleep } from "./callbackFetch";
import type { CallbackTarget } from "./TurnCallbackClient";

/** The platform refused a files request for good: the space moved on, this run no longer holds it, or the request was wrong. */
export class FilesRequestRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilesRequestRejected";
  }
}

/** What a Files run asks the platform for: access to the space's saved files, and saving its own. */
export class FilesCallbackClient {
  constructor(private readonly target: CallbackTarget) {}

  async storageGrant(jobId: string, tenantId: string, operation: FilesStorageOperation): Promise<FilesStorageGrant> {
    const data = await this.post(jobId, tenantId, "storage-url", { operation }, 15_000);
    if (!isRecord(data) || typeof data.url !== "string" || typeof data.expiresAt !== "string") {
      throw new Error("The platform answered the files storage request with something unexpected");
    }
    return { url: data.url, expiresAt: data.expiresAt };
  }

  /**
   * Saving is idempotent per run, so a timeout or a server error is retried;
   * a conflict means the space can't take these files, and is final.
   */
  async checkpoint(jobId: string, tenantId: string, request: FilesCheckpointRequest): Promise<FilesCheckpointResult> {
    const attempts = Math.max(1, this.target.maxRetries + 1);
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const data = await this.post(jobId, tenantId, "checkpoint", request, 120_000);
        if (!isRecord(data) || typeof data.id !== "string") throw new Error("The platform answered the files save with something unexpected");
        return data as unknown as FilesCheckpointResult;
      } catch (error) {
        if (error instanceof FilesRequestRejected) throw error;
        lastError = error;
        if (attempt < attempts - 1) await sleep(this.target.retryDelay * 2 ** attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async post(jobId: string, tenantId: string, route: string, body: unknown, timeoutMs: number): Promise<unknown> {
    const response = await fetch(`${this.target.apiUrl}/api/jobs/${encodeURIComponent(jobId)}/files/${route}`, {
      method: "POST",
      headers: buildCallbackHeaders(tenantId, this.target.callbackToken),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : response.statusText;
      if (response.status === 409) throw new FilesRequestRejected(message);
      const error = new Error(`Files ${route} request failed (HTTP ${response.status}): ${message}`);
      // Client errors other than a conflict won't change on a retry.
      if (response.status < 500 && response.status !== 429) throw new FilesRequestRejected(error.message);
      throw error;
    }
    return isRecord(payload) ? payload.data : undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
