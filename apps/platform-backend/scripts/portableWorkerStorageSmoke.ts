import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Logger } from "winston";
import { WorkerStorageService, signWorkerStorageUrl } from "../src/services/job/WorkerStorageService";
import { PresignedWorkerStorage } from "../../viberator/src/workers/infrastructure/PresignedWorkerStorage";
import { ConfigLoader } from "../../viberator/src/workers/infrastructure/ConfigLoader";
import { captureAndStore, retrieveAndRestore } from "../../viberator/src/workers/runtime/SessionStateManager";

export async function portableWorkerStorageSmoke(instructionUrl: string, sourceHome: string, targetHome: string, logger: Logger): Promise<string> {
  const payload: Record<string, unknown> = { workerType: "kubernetes", agentSessionId: "scoped-session",
    instructionFiles: [{ s3Url: instructionUrl }] };
  let active = true;
  const storage = new WorkerStorageService({
    async getBootstrapPayload() { return { tenantId: "scoped-tenant", status: active ? "active" : "cancelled", payload }; },
  }, signWorkerStorageUrl);
  const server = createServer(async (request, response) => {
    assert.equal(request.headers["x-callback-token"], "scoped-token");
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString());
    try {
      if (typeof input !== "object" || input === null || !("operation" in input) ||
          (input.operation !== "read" && input.operation !== "write")) throw new Error("Invalid input");
      const reference = "storageUrl" in input && typeof input.storageUrl === "string" ? input.storageUrl : undefined;
      const data = await storage.grant("scoped-run", "scoped-tenant", input.operation, reference);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ data }));
    } catch { response.writeHead(403).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const workerStorage = new PresignedWorkerStorage({ jobId: "scoped-run", tenantId: "scoped-tenant", callbackToken: "scoped-token",
      platformApiUrl: `http://127.0.0.1:${address.port}` });
    assert.equal(await new ConfigLoader(logger, undefined, workerStorage).fetchInstructionFile(instructionUrl), "portable instructions");
    const archive = await captureAndStore("opencode", "scoped-session", sourceHome, logger, workerStorage);
    assert(archive?.startsWith("s3://"));
    payload.conversationStateUrl = archive;
    await retrieveAndRestore(archive, targetHome, logger, workerStorage);
    await assert.rejects(() => workerStorage.download("s3://another-bucket/private"), /HTTP 403/);
    active = false;
    await assert.rejects(() => workerStorage.upload(Buffer.from("refused")), /HTTP 403/);
    return archive;
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
