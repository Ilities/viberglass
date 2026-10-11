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
import { createKubernetesSecretClient, KubernetesRunSecret } from "../src/workers/invokers/KubernetesRunSecret";
import { KubernetesWorkerStopper } from "../src/workers/stoppers/KubernetesWorkerStopper";
import { kubernetesRunSecretName } from "../src/workers/invokers/KubernetesRunSecret";
import { KubernetesPodInspector, createKubernetesPodClient } from "../src/workers/invokers/KubernetesPodInspector";
import { KubernetesJobReconciler } from "../src/workers/KubernetesJobReconciler";

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
  const secrets = new KubernetesRunSecret(createKubernetesSecretClient);
  const invoker = new KubernetesInvoker(createKubernetesJobClient, {
    async saveBootstrapPayload(id, payload) { payloads.set(id, payload); },
  }, { async getRequiredCredentialsForClanker() { return []; } }, { async getStatus() { return "active"; } }, { workerBindings() { return []; } }, secrets);
  const stopper = new KubernetesWorkerStopper(createKubernetesJobClient, secrets);
  const client = await createKubernetesJobClient();
  const runs: string[] = [];
  function job(task: string): JobData {
    const id = randomUUID();
    runs.push(id);
    return {
      id, jobKind: "planning", tenantId: "smoke-tenant", callbackToken: randomUUID(),
      repository: `${process.env.PLATFORM_API_URL}/repo.git`, baseBranch: "main", task,
      context: { ticketId: randomUUID() }, timestamp: Date.now(),
    };
  }

  try {
    const successful = job("Write PLAN.md for the Kubernetes smoke test.");
    const execution = await invoker.invoke(successful, clanker);
    assert.deepEqual(await invoker.invoke(successful, clanker), execution);
    const createdJob = await client.readNamespacedJob({ namespace, name: execution.executionId });
    assert(!JSON.stringify(createdJob).includes(successful.callbackToken!));
    assert(!createdJob.spec?.template.spec?.containers[0].envFrom);
    const secretClient = await createKubernetesSecretClient();
    const secret = await secretClient.readNamespacedSecret({ namespace, name: kubernetesRunSecretName(successful.id) });
    assert.equal(secret.immutable, true);
    assert.equal(secret.metadata?.ownerReferences?.[0].uid, createdJob.metadata?.uid);
    await waitFor(async () => results.has(successful.id), "the worker result callback");
    const result = results.get(successful.id);
    assert(isObjectRecord(result) && result.success === true, `Worker failed: ${JSON.stringify(result)}`);
    await waitFor(async () => (await client.readNamespacedJob({ namespace, name: execution.executionId })).status?.succeeded === 1, "Job completion");

    const cancelled = job("[fake:sleep=60] Write PLAN.md.");
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
    await assert.rejects(() => secretClient.readNamespacedSecret({ namespace, name: kubernetesRunSecretName(cancelled.id) }),
      error => kubernetesStatusCode(error) === 404);

    for (const strategy of [{ type: "kubernetes", containerImage: "invalid image name" },
      { type: "kubernetes", containerImage: image, cpu: "100000" }]) {
      const unavailable = job("Write PLAN.md.");
      const runner: Clanker = { ...clanker, deploymentConfig: { version: 1, strategy, agent: { type: "fake" } } };
      await invoker.invoke(unavailable, runner);
      let failure: string | undefined;
      const diagnostics: string[] = [];
      const reconciler = new KubernetesJobReconciler(createKubernetesJobClient,
        async () => [{ id: unavailable.id, started_at: new Date(Date.now() - 300_000) }],
        { async updateJobStatus(_id, _status, updates) { failure = updates?.errorMessage; return true; } },
        { async stop(id) { await stopper.stop(id); } }, new KubernetesPodInspector(createKubernetesPodClient),
        { async record(_id, _source, entries) { diagnostics.push(...entries.map(entry => entry.message)); } });
      await waitFor(async () => { await reconciler.sweep(); return Boolean(failure); }, "startup failure reconciliation");
      assert(failure?.includes(strategy.cpu ? "Unschedulable" : "InvalidImageName"), failure);
      assert(diagnostics.length > 0);
    }
    console.log("Kubernetes smoke passed: mounted run token, owned Secret cleanup, worker callback, duplicate submission, cancellation, image failures and scheduling diagnostics");
  } finally {
    for (const id of runs) await stopper.stop(id);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(fixture, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
