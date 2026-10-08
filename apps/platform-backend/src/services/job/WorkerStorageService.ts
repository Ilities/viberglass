import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isObjectRecord, objectStorageBucket, objectStorageClientConfig } from "@viberglass/types";
import type { JobBootstrapService } from "./JobBootstrapService";

export class WorkerStorageDenied extends Error {}

export interface WorkerStorageGrant {
  url: string;
  storageUrl: string;
}

type StorageSigner = (operation: "read" | "write", storageUrl: string) => Promise<string>;

export async function signWorkerStorageUrl(operation: "read" | "write", storageUrl: string): Promise<string> {
  const parsed = new URL(storageUrl);
  const client = new S3Client(objectStorageClientConfig(process.env));
  const object = { Bucket: parsed.hostname, Key: parsed.pathname.slice(1) };
  try {
    return await getSignedUrl(client, operation === "read" ? new GetObjectCommand(object) : new PutObjectCommand({
      ...object, ContentType: "application/gzip",
    }), { expiresIn: 60 });
  } finally { client.destroy(); }
}

export function workerArchiveUrl(jobId: string, payload: Record<string, unknown>, bucket: string): string {
  const session = typeof payload.agentSessionId === "string" ? payload.agentSessionId : jobId;
  return `s3://${bucket}/conversation-state/${encodeURIComponent(session)}/${encodeURIComponent(jobId)}.tar.gz`;
}

function readReferences(payload: Record<string, unknown>): string[] {
  const references: string[] = [];
  if (typeof payload.conversationStateUrl === "string") references.push(payload.conversationStateUrl);
  for (const file of Array.isArray(payload.instructionFiles) ? payload.instructionFiles : []) {
    if (isObjectRecord(file) && typeof file.s3Url === "string") references.push(file.s3Url);
  }
  const media = isObjectRecord(payload.context) && Array.isArray(payload.context.ticketMedia) ? payload.context.ticketMedia : [];
  for (const file of media) {
    if (!isObjectRecord(file)) continue;
    if (typeof file.s3Url === "string") references.push(file.s3Url);
    if (typeof file.storageUrl === "string" && file.storageUrl.startsWith("s3://")) references.push(file.storageUrl);
  }
  return references;
}

export class WorkerStorageService {
  constructor(
    private readonly bootstraps: Pick<JobBootstrapService, "getBootstrapPayload">,
    private readonly sign: StorageSigner,
    private readonly bucket: () => string | undefined = () => objectStorageBucket(process.env),
  ) {}

  async grant(jobId: string, tenantId: string, operation: "read" | "write", reference?: string): Promise<WorkerStorageGrant> {
    const bootstrap = await this.bootstraps.getBootstrapPayload(jobId);
    if (!bootstrap || bootstrap.tenantId !== tenantId || bootstrap.status !== "active" || bootstrap.payload?.workerType !== "kubernetes") {
      throw new WorkerStorageDenied("Storage is only available for this active Kubernetes run");
    }
    const bucket = this.bucket();
    if (!bucket) throw new Error("Worker object storage is not configured");
    const storageUrl = operation === "write" ? workerArchiveUrl(jobId, bootstrap.payload, bucket) : reference;
    if (!storageUrl || !storageUrl.startsWith("s3://") ||
        (operation === "read" && !readReferences(bootstrap.payload).includes(storageUrl))) {
      throw new WorkerStorageDenied("This object is not authorized for the run");
    }
    return { storageUrl, url: await this.sign(operation, storageUrl) };
  }

  async validateArchive(jobId: string, tenantId: string, reference: string): Promise<void> {
    const bootstrap = await this.bootstraps.getBootstrapPayload(jobId);
    if (bootstrap?.payload?.workerType !== "kubernetes") return;
    const bucket = this.bucket();
    if (!bucket || bootstrap.tenantId !== tenantId || bootstrap.status !== "active" ||
        reference !== workerArchiveUrl(jobId, bootstrap.payload, bucket)) {
      throw new WorkerStorageDenied("Conversation state must be the archive assigned to this active run");
    }
  }
}
