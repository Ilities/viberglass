import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { isObjectRecord, type Clanker } from "@viberglass/types";
import type { JobData } from "../src/types/Job";
import { KubernetesInvoker } from "../src/workers/invokers/KubernetesInvoker";
import { createKubernetesJobClient, kubernetesStatusCode } from "../src/workers/invokers/kubernetesJobClient";
import { KubernetesWorkerStopper } from "../src/workers/stoppers/KubernetesWorkerStopper";

async function waitFor(check: () => Promise<boolean>, description: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await setTimeout(1000);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function main(): Promise<void> {
  const image = process.env.KUBERNETES_SMOKE_IMAGE;
  const callbackHost = process.env.KUBERNETES_SMOKE_HOST;
  const namespace = process.env.KUBERNETES_WORKER_NAMESPACE;
  assert(image && callbackHost && namespace && process.env.KUBECONFIG,
    "Set KUBECONFIG, KUBERNETES_WORKER_NAMESPACE, KUBERNETES_SMOKE_IMAGE, and KUBERNETES_SMOKE_HOST for a disposable cluster");

  const fixture = await mkdtemp(path.join(tmpdir(), "viberglass-kubernetes-smoke-"));
  const source = path.join(fixture, "source");
  const repository = path.join(fixture, "repo.git");
  execFileSync("git", ["init", "-b", "main", source], { stdio: "ignore" });
  await writeFile(path.join(source, "README.md"), "Kubernetes worker smoke test\n");
  execFileSync("git", ["-C", source, "add", "README.md"]);
  execFileSync("git", ["-C", source, "-c", "user.name=Smoke Test", "-c", "user.email=smoke@local.test", "commit", "-m", "Initialize fixture"], { stdio: "ignore" });
  execFileSync("git", ["clone", "--bare", source, repository], { stdio: "ignore" });
  execFileSync("git", ["--git-dir", repository, "update-server-info"]);

  const payloads = new Map<string, Record<string, unknown>>();
  const results = new Map<string, unknown>();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname.startsWith("/repo.git/")) {
        const file = path.resolve(repository, url.pathname.slice("/repo.git/".length));
        if (!file.startsWith(`${repository}${path.sep}`)) {
          response.writeHead(400).end();
          return;
        }
        const content = await readFile(file);
        response.writeHead(200, { "Content-Type": "application/octet-stream" });
        response.end(content);
        return;
      }
      const match = /^\/api\/jobs\/([^/]+)\/(.+)$/.exec(url.pathname);
      const payload = match ? payloads.get(match[1]) : undefined;
      if (!match || !payload || request.headers["x-callback-token"] !== payload.callbackToken) {
        response.writeHead(403).end();
        return;
      }
      response.setHeader("Content-Type", "application/json");
      if (request.method === "GET" && match[2] === "bootstrap") {
        response.end(JSON.stringify({ data: payload }));
        return;
      }
      let body = "";
      for await (const chunk of request) body += chunk.toString();
      if (match[2] === "result") results.set(match[1], JSON.parse(body));
      response.end(JSON.stringify({ success: true }));
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  process.env.PLATFORM_API_URL = `http://${callbackHost}:${address.port}`;

  const clanker: Clanker = {
    id: randomUUID(), name: "Kubernetes smoke", slug: "kubernetes-smoke", description: null,
    agent: "fake", configFiles: [], secretBindings: [], status: "active", statusMessage: null,
    deploymentConfig: { version: 1, strategy: { type: "kubernetes", containerImage: image }, agent: { type: "fake" } },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const invoker = new KubernetesInvoker(createKubernetesJobClient, {
    async saveBootstrapPayload(id, payload) { payloads.set(id, payload); },
  }, { async getRequiredCredentialsForClanker() { return []; } }, { async getStatus() { return "active"; } }, { workerBindings() { return []; } });
  const stopper = new KubernetesWorkerStopper(createKubernetesJobClient);
  const client = await createKubernetesJobClient();
  const runs: string[] = [];
  function job(task: string): JobData {
    const id = randomUUID();
    runs.push(id);
    return {
      id, jobKind: "research", tenantId: "smoke-tenant", callbackToken: randomUUID(),
      repository: `${process.env.PLATFORM_API_URL}/repo.git`, baseBranch: "main", task,
      context: { ticketId: randomUUID() }, timestamp: Date.now(),
    };
  }

  try {
    const successful = job("Write RESEARCH.md for the Kubernetes smoke test.");
    const execution = await invoker.invoke(successful, clanker);
    assert.deepEqual(await invoker.invoke(successful, clanker), execution);
    await waitFor(async () => results.has(successful.id), "the worker result callback");
    const result = results.get(successful.id);
    assert(isObjectRecord(result) && result.success === true, `Worker failed: ${JSON.stringify(result)}`);
    await waitFor(async () => (await client.readNamespacedJob({ namespace, name: execution.executionId })).status?.succeeded === 1, "Job completion");

    const cancelled = job("[fake:sleep=60] Write RESEARCH.md.");
    const cancellation = await invoker.invoke(cancelled, clanker);
    await waitFor(async () => (await client.readNamespacedJob({ namespace, name: cancellation.executionId })).status?.active === 1, "a running worker");
    assert.equal(await stopper.stop(cancelled.id), true);
    await waitFor(async () => {
      try {
        await client.readNamespacedJob({ namespace, name: cancellation.executionId });
        return false;
      } catch (error) {
        if (kubernetesStatusCode(error) === 404) return true;
        throw error;
      }
    }, "Job deletion");
    assert.equal(await stopper.stop(cancelled.id), false);
    console.log("Kubernetes smoke passed: worker callback, Job completion, duplicate submission, and cancellation");
  } finally {
    for (const id of runs) await stopper.stop(id);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(fixture, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
