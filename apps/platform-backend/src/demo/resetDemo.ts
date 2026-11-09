/**
 * One step of the demo instance's nightly reset, which the chart's CronJob
 * runs in order. See README.md in this directory.
 *
 *   node dist/demo/resetDemo.js scale-down|clear-apps|reset-database|wipe-bucket|scale-up
 */
import { S3Client } from "@aws-sdk/client-s3";
import { objectStorageBucket, objectStorageClientConfig } from "@viberglass/types";
import { loadKubernetesConfig } from "../workers/invokers/kubernetesJobClient";
import { AppResourceCleanup } from "./reset/AppResourceCleanup";
import { BackendScale } from "./reset/BackendScale";
import { BucketWipe } from "./reset/BucketWipe";
import { DatabaseReset } from "./reset/DatabaseReset";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

async function backendScale(): Promise<BackendScale> {
  const { AppsV1Api } = await import("@kubernetes/client-node");
  const api = (await loadKubernetesConfig()).makeApiClient(AppsV1Api);
  return new BackendScale(api, required("POD_NAMESPACE"), required("DEMO_BACKEND_DEPLOYMENT"));
}

const STEPS: Record<string, () => Promise<void>> = {
  "scale-down": async () => (await backendScale()).scaleTo(0),
  "scale-up": async () => (await backendScale()).scaleTo(Number(process.env.DEMO_BACKEND_REPLICAS ?? "1")),
  "clear-apps": async () => {
    const { AppsV1Api, CoreV1Api } = await import("@kubernetes/client-node");
    const config = await loadKubernetesConfig();
    await new AppResourceCleanup(config.makeApiClient(AppsV1Api), config.makeApiClient(CoreV1Api), required("KUBERNETES_APPS_NAMESPACE")).run();
  },
  "reset-database": async () => {
    const { pool } = await import("../persistence/config/database");
    const client = await pool.connect();
    try {
      await new DatabaseReset(client).run();
    } finally {
      client.release();
      await pool.end();
    }
  },
  "wipe-bucket": async () => {
    const bucket = objectStorageBucket(process.env);
    if (!bucket) throw new Error("Set S3_BUCKET");
    const s3 = new S3Client(objectStorageClientConfig(process.env));
    try {
      console.log(`Deleted ${await new BucketWipe(s3, bucket).run()} objects from ${bucket}`);
    } finally {
      s3.destroy();
    }
  },
};

async function main(): Promise<void> {
  const name = process.argv[2] ?? "";
  const step = STEPS[name];
  if (!step) throw new Error(`Pass one of: ${Object.keys(STEPS).join(", ")}`);
  await step();
  console.log(`Done: ${name}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
