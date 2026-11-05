import { execFileSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { liveAppInstance, objectStorageClientConfig, previewInstance, releaseBundleKey } from "@viberglass/types";
import { AppDataStore } from "../../services/apps/AppDataStore";
import { AppInstanceSpecs } from "../../services/apps/AppInstanceSpecs";
import { AppSubnetPool } from "../../services/apps/AppSubnetPool";
import { DockerAppHost } from "../../services/apps/DockerAppHost";
import { StsAppDataCredentials } from "../../services/apps/StsAppDataCredentials";
import { appRelease } from "../helpers/fakeAppHost";

const RUNTIME_IMAGE = process.env.APP_RUNTIME_IMAGE || "viberglass-app-runtime-node:latest";
const BUCKET = "apps-test";

function imageExists(image: string): boolean {
  try {
    execFileSync("docker", ["image", "inspect", image], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Needs the runtime image: `npm run build:app-images`.
const describeWithRuntime = imageExists(RUNTIME_IMAGE) ? describe : describe.skip;

const SERVER = `
const http = require("http");
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("/data/app.db");
db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS notes (text TEXT)");
http.createServer((req, res) => {
  if (req.url === "/healthz") return res.end("ok");
  if (req.method === "POST") {
    db.prepare("INSERT INTO notes VALUES (?)").run(req.url.slice(1));
    return res.end("saved");
  }
  res.end(JSON.stringify(db.prepare("SELECT text FROM notes").all().map((row) => row.text)));
}).listen(process.env.PORT);
`;

const PROJECT = randomUUID();
const INSTANCE = liveAppInstance(PROJECT);
const PREVIEW = previewInstance(randomUUID());
const RELEASE_ID = randomUUID();
let storage: StartedTestContainer;
let env: Record<string, string>;
let host: DockerAppHost;

function inApp(method: "GET" | "POST", url: string, instance = INSTANCE): string {
  const script = `fetch("http://localhost:3000${url}", { method: "${method}" }).then((r) => r.text()).then((t) => process.stdout.write(t))`;
  return execFileSync("docker", ["exec", `viberglass-${instance}`, "node", "-e", script], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

async function startRelease(preview?: string): Promise<void> {
  const release = appRelease(RELEASE_ID, { projectId: PROJECT, bundleSha256: env.BUNDLE_SHA256 });
  const role = preview ? { kind: "preview" as const, instance: preview } : undefined;
  const { spec } = await new AppInstanceSpecs(new StsAppDataCredentials(() => env), () => env).specFor("docker", release, role);
  await host.create(spec);
  await host.start(spec.instance);
  await waitForHealth(spec.instance);
}

async function waitForHealth(instance = INSTANCE): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if (inApp("GET", "/healthz", instance) === "ok") return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The app didn't start:\n${await host.logs(instance, 50)}`);
}

async function uploadBundle(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "app-bundle-"));
  fs.writeFileSync(path.join(dir, "server.js"), SERVER);
  fs.writeFileSync(path.join(dir, "viberglass.app.json"), JSON.stringify({ build: "true", start: "node server.js", settings: [] }));
  const bundle = path.join(os.tmpdir(), `bundle-${PROJECT}.tar.gz`);
  execFileSync("tar", ["-czf", bundle, "-C", dir, "."]);
  const body = fs.readFileSync(bundle);
  const client = new S3Client(objectStorageClientConfig(env));
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: releaseBundleKey(PROJECT, RELEASE_ID), Body: body }));
  client.destroy();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(bundle, { force: true });
  return createHash("sha256").update(body).digest("hex");
}

describeWithRuntime("running an app on Docker", () => {
  beforeAll(async () => {
    storage = await new GenericContainer("cgr.dev/chainguard/minio")
      .withEntrypoint(["sh"])
      .withCommand(["-c", `mkdir -p /data/${BUCKET} && minio server --address :9000 /data`])
      .withEnvironment({ MINIO_ROOT_USER: "viberglass", MINIO_ROOT_PASSWORD: "viberglass-test" })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp("/minio/health/ready", 9000))
      .start();
    env = {
      S3_ENDPOINT: `http://${storage.getHost()}:${storage.getMappedPort(9000)}`,
      S3_BUCKET: BUCKET,
      S3_REGION: "us-east-1",
      S3_FORCE_PATH_STYLE: "true",
      S3_ACCESS_KEY_ID: "viberglass",
      S3_SECRET_ACCESS_KEY: "viberglass-test",
      APPS_DATA_ENDPOINT: "http://storage:9000",
      APP_RUNTIME_IMAGE: RUNTIME_IMAGE,
    };
    env.BUNDLE_SHA256 = await uploadBundle();
    host = new DockerAppHost({
      gatewayContainer: null,
      storage: { container: storage.getId(), alias: "storage" },
      memoryMb: 256,
      cpus: 1,
      subnets: new AppSubnetPool("10.251.0.0/16"),
    });
  }, 120_000);

  afterAll(async () => {
    await host?.delete(INSTANCE);
    await host?.delete(PREVIEW);
    await storage?.stop();
  }, 60_000);

  it("keeps a write made right before the app stops, and restores data from a backup", async () => {
    const data = new AppDataStore(() => env);
    await startRelease();
    expect(inApp("POST", "/first")).toBe("saved");
    await host.stop(INSTANCE, 30);

    const backupId = randomUUID();
    await expect(data.backup(PROJECT, backupId)).resolves.toMatchObject({ objects: expect.any(Number) });

    // Without its volume the app has only its replica to start from.
    await host.clearData(INSTANCE);
    await startRelease();
    expect(JSON.parse(inApp("GET", "/"))).toEqual(["first"]);

    expect(inApp("POST", "/second")).toBe("saved");
    await host.stop(INSTANCE, 30);
    await data.restore(PROJECT, backupId);
    await host.clearData(INSTANCE);
    await startRelease();
    expect(JSON.parse(inApp("GET", "/"))).toEqual(["first"]);
    expect(await host.status(INSTANCE)).toEqual({ state: "running" });
  }, 180_000);

  it("gives the app credentials that reach only its own replica", async () => {
    const { env: credentials, expiresAt } = await new StsAppDataCredentials(() => env).forApp(PROJECT);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const client = new S3Client({
      ...objectStorageClientConfig(env),
      credentials: { accessKeyId: credentials.AWS_ACCESS_KEY_ID, secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY, sessionToken: credentials.AWS_SESSION_TOKEN },
    });
    const put = (key: string) => client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: "x" }));

    await expect(put(`spaces/${PROJECT}/app-data/probe`)).resolves.toBeDefined();
    await expect(put(`spaces/${PROJECT}/backups/probe`)).rejects.toMatchObject({ name: "AccessDenied" });
    await expect(put(`spaces/${randomUUID()}/app-data/probe`)).rejects.toMatchObject({ name: "AccessDenied" });
    client.destroy();
  });

  it("starts a preview from the live data and keeps none of its writes", async () => {
    await startRelease();
    expect(inApp("POST", "/live")).toBe("saved");
    await host.stop(INSTANCE, 30);

    await startRelease(PREVIEW);
    expect(JSON.parse(inApp("GET", "/", PREVIEW))).toContain("live");
    expect(inApp("POST", "/preview-only", PREVIEW)).toBe("saved");
    await host.delete(PREVIEW);

    await host.clearData(INSTANCE);
    await startRelease();
    expect(JSON.parse(inApp("GET", "/"))).not.toContain("preview-only");
    await host.stop(INSTANCE, 30);
  }, 180_000);

  it("gives a preview credentials that only read its app's replica", async () => {
    const { env: credentials } = await new StsAppDataCredentials(() => env).forPreview(PROJECT);
    const client = new S3Client({
      ...objectStorageClientConfig(env),
      credentials: { accessKeyId: credentials.AWS_ACCESS_KEY_ID, secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY, sessionToken: credentials.AWS_SESSION_TOKEN },
    });

    await expect(client.send(new PutObjectCommand({ Bucket: BUCKET, Key: `spaces/${PROJECT}/app-data/probe`, Body: "x" }))).rejects.toMatchObject({
      name: "AccessDenied",
    });
    client.destroy();
  });

  it("reconnects the platform only to the networks of its own App spaces", async () => {
    const foreign = `viberglass-app-${randomUUID()}`;
    execFileSync("docker", ["network", "create", "--label", `viberglass.app=${randomUUID()}`, foreign], { stdio: "ignore" });
    try {
      await host.rejoinPlatform([PROJECT]);
      const joined = execFileSync("docker", ["network", "inspect", foreign, "--format", "{{range .Containers}}{{.Name}} {{end}}"], { encoding: "utf8" });
      expect(joined.trim()).toBe("");
    } finally {
      execFileSync("docker", ["network", "rm", foreign], { stdio: "ignore" });
    }
  });

  it("runs the app on a read-only root in the app subnet pool, and restarts it from its unpacked release once the bundle is gone", async () => {
    await startRelease();
    const canWrite = (file: string) => {
      try {
        execFileSync("docker", ["exec", `viberglass-app-${PROJECT}`, "touch", file], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };
    expect(canWrite("/etc/probe")).toBe(false);
    expect(canWrite("/tmp/probe")).toBe(true);
    const subnet = execFileSync("docker", ["network", "inspect", `viberglass-app-${PROJECT}`, "--format", "{{(index .IPAM.Config 0).Subnet}}"], { encoding: "utf8" });
    expect(subnet.trim()).toMatch(/^10\.251\.\d+\.0\/24$/);

    const client = new S3Client(objectStorageClientConfig(env));
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: releaseBundleKey(PROJECT, RELEASE_ID) }));
    client.destroy();
    execFileSync("docker", ["restart", `viberglass-app-${PROJECT}`], { stdio: "ignore" });
    await waitForHealth();
    await host.stop(INSTANCE, 30);
  }, 120_000);
});
