import type { ReleaseBundleGrant, ReleaseCompleteRequest } from "@viberglass/types";
import { buildCallbackHeaders, sleep } from "./callbackFetch";
import type { CallbackTarget } from "./TurnCallbackClient";

/** The platform refused for good: this run isn't building the release any more, or the request was wrong. */
export class ReleaseRequestRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseRequestRejected";
  }
}

/** What a release build asks the platform for: where to upload its bundle, and to record how it went. */
export class ReleaseCallbackClient {
  constructor(private readonly target: CallbackTarget) {}

  async storageGrant(jobId: string, tenantId: string): Promise<ReleaseBundleGrant> {
    const data = await this.post(jobId, tenantId, "storage-url", {});
    if (!isRecord(data) || typeof data.url !== "string" || typeof data.expiresAt !== "string") {
      throw new Error("The platform answered the bundle upload request with something unexpected");
    }
    return { url: data.url, expiresAt: data.expiresAt };
  }

  async complete(jobId: string, tenantId: string, request: ReleaseCompleteRequest): Promise<void> {
    await this.post(jobId, tenantId, "complete", this.target.redactor.redactValue(request));
  }

  /** Server errors and timeouts are retried; a refusal is final. */
  private async post(jobId: string, tenantId: string, route: string, body: unknown): Promise<unknown> {
    const attempts = Math.max(1, this.target.maxRetries + 1);
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await this.postOnce(jobId, tenantId, route, body);
      } catch (error) {
        if (error instanceof ReleaseRequestRejected) throw error;
        lastError = error;
        if (attempt < attempts - 1) await sleep(this.target.retryDelay * 2 ** attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async postOnce(jobId: string, tenantId: string, route: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.target.apiUrl}/api/jobs/${encodeURIComponent(jobId)}/release/${route}`, {
      method: "POST",
      headers: buildCallbackHeaders(tenantId, this.target.callbackToken),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : response.statusText;
      const error = `Release ${route} request failed (HTTP ${response.status}): ${message}`;
      if (response.status < 500 && response.status !== 429) throw new ReleaseRequestRejected(error);
      throw new Error(error);
    }
    return isRecord(payload) ? payload.data : undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
