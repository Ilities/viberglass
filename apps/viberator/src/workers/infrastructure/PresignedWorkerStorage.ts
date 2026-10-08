import type { BaseWorkerPayload } from "../core/types";
import type { WorkerObjectStorage } from "./workerObjectStorage";

export class PresignedWorkerStorage implements WorkerObjectStorage {
  constructor(private readonly run: Pick<BaseWorkerPayload, "jobId" | "tenantId" | "platformApiUrl" | "callbackToken">) {}

  async download(storageUrl: string): Promise<Buffer> {
    const grant = await this.grant("read", storageUrl);
    const response = await fetch(grant.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Worker storage download failed (HTTP ${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  async upload(archive: Buffer): Promise<string> {
    const grant = await this.grant("write");
    const response = await fetch(grant.url, { method: "PUT", body: new Uint8Array(archive),
      headers: { "Content-Type": "application/gzip" }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Worker storage upload failed (HTTP ${response.status})`);
    return grant.storageUrl;
  }

  private async grant(operation: "read" | "write", storageUrl?: string): Promise<{ url: string; storageUrl: string }> {
    if (!this.run.platformApiUrl || !this.run.callbackToken) throw new Error("Worker storage requires authenticated platform access");
    const response = await fetch(`${this.run.platformApiUrl}/api/jobs/${encodeURIComponent(this.run.jobId)}/storage-url`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", "X-Callback-Token": this.run.callbackToken, "X-Tenant-Id": this.run.tenantId },
      body: JSON.stringify({ operation, storageUrl }),
    });
    if (!response.ok) throw new Error(`Worker storage authorization failed (HTTP ${response.status})`);
    const body: unknown = await response.json();
    const data = typeof body === "object" && body !== null && "data" in body ? body.data : undefined;
    if (typeof data !== "object" || data === null || !("url" in data) || typeof data.url !== "string" ||
        !("storageUrl" in data) || typeof data.storageUrl !== "string") throw new Error("Invalid worker storage response");
    return { url: data.url, storageUrl: data.storageUrl };
  }
}
