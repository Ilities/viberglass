import { sql } from "kysely";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { GenericContainer } from "testcontainers";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { CreateBucketCommand, ListObjectsV2Command, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { objectStorageClientConfig } from "@viberglass/types";
import { createLogger } from "winston";

async function main(): Promise<void> {
  const accessKey = "portable-smoke";
  const secretKey = randomBytes(24).toString("hex");
  const minio = await new GenericContainer("cgr.dev/chainguard/minio:latest")
    .withUser("0")
    .withEnvironment({ MINIO_ROOT_USER: accessKey, MINIO_ROOT_PASSWORD: secretKey })
    .withCommand(["server", "/data"])
    .withExposedPorts(9000)
    .start();
  let postgres: StartedPostgreSqlContainer | undefined;
  let client: S3Client | undefined;
  let closeDatabase: (() => Promise<void>) | undefined;
  const fixture = await mkdtemp(path.join(tmpdir(), "viberglass-portable-smoke-"));
  try {
    postgres = await new PostgreSqlContainer("postgres:17-alpine").start();
    Object.assign(process.env, {
      DATABASE_URL: postgres.getConnectionUri(), DB_SSL: "false",
      S3_ENDPOINT: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      S3_REGION: "us-east-1", S3_BUCKET: `portable-${randomUUID()}`,
      S3_FORCE_PATH_STYLE: "true", S3_ACCESS_KEY_ID: accessKey, S3_SECRET_ACCESS_KEY: secretKey,
      SECRETS_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      TICKET_MEDIA_DISK_ROOT: path.join(fixture, "media"), AWS_EC2_METADATA_DISABLED: "true",
    });
    for (const key of ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_S3_BUCKET"]) delete process.env[key];
    const { default: db } = await import("../src/persistence/config/database");
    closeDatabase = () => db.destroy();
    await db.schema.createTable("secrets")
      .addColumn("id", "uuid", (column) => column.primaryKey())
      .addColumn("name", "text", (column) => column.notNull().unique())
      .addColumn("secret_location", "text", (column) => column.notNull())
      .addColumn("secret_path", "text")
      .addColumn("secret_value_encrypted", "text")
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .addColumn("updated_at", "timestamptz", (column) => column.notNull())
      .execute();

    const { SecretService } = await import("../src/services/SecretService");
    const { WorkerBootstrapCredentials } = await import("../src/services/job/WorkerBootstrapCredentials");
    const { CredentialProvider } = await import("../../viberator/src/workers/infrastructure/CredentialProvider");
    const secrets = new SecretService();
    const privateValue = randomBytes(24).toString("hex");
    const secret = await secrets.createSecret({ name: "AGENT_KEY", secretLocation: "database", secretValue: privateValue });
    await secrets.createSecret({ name: "OTHER_RUN_KEY", secretLocation: "database", secretValue: "unlisted" });
    const stored = await db.selectFrom("secrets").select("secret_value_encrypted").where("id", "=", secret.id).executeTakeFirstOrThrow();
    assert(stored.secret_value_encrypted && !stored.secret_value_encrypted.includes(privateValue));
    const payload = { requiredCredentials: ["AGENT_KEY"] };
    const credentials = await new WorkerBootstrapCredentials(secrets).resolve(payload);
    assert.deepEqual(credentials, { AGENT_KEY: privateValue });
    assert(!("credentials" in payload));
    const logger = createLogger({ silent: true });
    const provider = new CredentialProvider(logger, { suppliedCredentials: credentials, ssmEnabled: false });
    assert.equal(await provider.getCredential("tenant-1", "AGENT_KEY"), privateValue);
    assert.equal(await provider.getCredential("tenant-1", "OTHER_RUN_KEY"), undefined);
    const auth = JSON.stringify({ tokens: "test-token".repeat(1000) });
    await secrets.upsertWorkerAuthCache("CODEX_AUTH", auth, "database");
    assert.equal(await secrets.resolveNamedSecret("CODEX_AUTH"), auth);

    await sql`CREATE TABLE jobs (id text PRIMARY KEY, status text, progress jsonb, result jsonb,
      error_message text, started_at timestamptz, finished_at timestamptz, last_heartbeat timestamptz)`.execute(db);
    await sql`INSERT INTO jobs (id, status) VALUES ('cancelled-run', 'cancelled'), ('completed-run', 'completed')`.execute(db);
    const { JobService } = await import("../src/services/JobService");
    const jobs = new JobService();
    const { JobDispatchStateDAO } = await import("../src/persistence/job/JobDispatchStateDAO");
    const dispatchState = new JobDispatchStateDAO();
    await jobs.updateJobStatus("cancelled-run", "active");
    await jobs.updateJobStatus("cancelled-run", "failed", { errorMessage: "Late dispatch failure" });
    await jobs.updateJobStatus("completed-run", "active");
    assert.equal(await dispatchState.getStatus("cancelled-run"), "cancelled");
    assert.equal(await dispatchState.getStatus("completed-run"), "completed");

    client = new S3Client(objectStorageClientConfig(process.env));
    const bucket = process.env.S3_BUCKET;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    const { InstructionStorageService } = await import("../src/services/instructions/InstructionStorageService");
    const { ConfigLoader } = await import("../../viberator/src/workers/infrastructure/ConfigLoader");
    const instructions = new InstructionStorageService();
    const reference = await instructions.storeClankerInstruction("smoke-clanker", "AGENTS.md", "portable instructions", "kubernetes");
    assert.equal(await instructions.readInstruction(reference), "portable instructions");
    assert.equal(await new ConfigLoader(logger).fetchInstructionFile(reference), "portable instructions");
    await instructions.deleteInstruction(reference);
    await assert.rejects(() => instructions.readInstruction(reference));

    const { FileUploadService } = await import("../src/services/FileUploadService");
    const files = new FileUploadService();
    const content = Buffer.from("smoke image bytes");
    const media = await files.uploadScreenshot({
      fieldname: "screenshot", originalname: "smoke.png", encoding: "7bit", mimetype: "image/png",
      size: content.length, buffer: content, stream: Readable.from(content), destination: "", filename: "", path: "",
    });
    assert(media.storageUrl?.startsWith("s3://"));
    const signedUrl = await files.generateSignedUrlFromStorageUrl(media.storageUrl);
    assert.equal(new URL(signedUrl).host, new URL(process.env.S3_ENDPOINT).host);
    const downloaded = await fetch(signedUrl);
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), content);
    await files.deleteFileByStorageUrl(media.storageUrl);
    assert.equal((await fetch(signedUrl)).status, 404);

    const { captureAndStore, retrieveAndRestore } = await import("../../viberator/src/workers/runtime/SessionStateManager");
    const sourceHome = path.join(fixture, "home-a");
    const targetHome = path.join(fixture, "home-b");
    const relativeState = ".local/share/opencode/opencode.db";
    await mkdir(path.dirname(path.join(sourceHome, relativeState)), { recursive: true });
    await mkdir(targetHome);
    await writeFile(path.join(sourceHome, relativeState), "conversation-state");
    await writeFile(path.join(sourceHome, ".local/share/opencode/auth.json"), "must-not-travel");
    const stateUrl = await captureAndStore("opencode", "smoke-session", sourceHome, logger);
    assert(stateUrl?.startsWith("s3://"));
    await retrieveAndRestore(stateUrl, targetHome, logger);
    assert.equal(await readFile(path.join(targetHome, relativeState), "utf8"), "conversation-state");
    await assert.rejects(() => readFile(path.join(targetHome, ".local/share/opencode/auth.json")));
    const objects = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
    for (const object of objects.Contents ?? []) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
    console.log("Portable smoke passed: encrypted database credentials, run allowlist, Codex refresh, instructions, signed media, deletion, and session restore without AWS credentials");
  } finally {
    client?.destroy();
    const cleanup = await Promise.allSettled([
      closeDatabase?.(),
      rm(fixture, { recursive: true, force: true }),
      postgres?.stop(),
      minio.stop(),
    ]);
    for (const result of cleanup) if (result.status === "rejected") throw result.reason;
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
