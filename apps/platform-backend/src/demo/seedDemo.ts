/**
 * Seeds an empty, migrated database and the instance's bucket from a demo
 * fixture bundle. See README.md in this directory.
 *
 *   node dist/demo/seedDemo.js [--force]
 */
import { parseArgs } from "util";
import { S3Client } from "@aws-sdk/client-s3";
import { objectStorageBucket, objectStorageClientConfig } from "@viberglass/types";
import { hashPassword } from "../api/auth/utils";
import { pool } from "../persistence/config/database";
import { LocalBundleSource, S3BundleSource, type BundleSource } from "./seed/BundleSource";
import { DemoSeeder } from "./seed/DemoSeeder";
import { ObjectImporter } from "./seed/ObjectImporter";

const HOUR_MS = 3_600_000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

function bundleSource(s3: S3Client): BundleSource {
  const directory = process.env.DEMO_FIXTURES_PATH?.trim();
  if (directory) return new LocalBundleSource(directory);
  return new S3BundleSource(s3, required("DEMO_FIXTURES_BUCKET"), process.env.DEMO_FIXTURES_PREFIX?.trim() ?? "");
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { force: { type: "boolean", default: false } } });
  const targetBucket = objectStorageBucket(process.env);
  if (!targetBucket) throw new Error("Set S3_BUCKET");
  const newestAgeHours = Number(process.env.DEMO_NEWEST_ACTIVITY_AGE_HOURS ?? "24");
  if (!Number.isFinite(newestAgeHours) || newestAgeHours < 0) throw new Error("DEMO_NEWEST_ACTIVITY_AGE_HOURS must be a number of hours");

  const s3 = new S3Client(objectStorageClientConfig(process.env));
  try {
    const source = bundleSource(s3);
    const seeder = new DemoSeeder(pool, source, new ObjectImporter(source, s3, targetBucket), {
      targetBucket,
      viewer: {
        email: required("DEMO_VIEWER_EMAIL"),
        password: required("DEMO_VIEWER_PASSWORD"),
        name: process.env.DEMO_VIEWER_NAME?.trim() || "Demo visitor",
      },
      hashPassword,
      log: (line) => console.log(line),
    });
    const counts = await seeder.seed({ force: values.force === true, now: new Date(), newestAgeMs: newestAgeHours * HOUR_MS });
    for (const [table, count] of counts) console.log(`${table}: ${count}`);
    console.log(`Seeded from ${source.describe()}`);
  } finally {
    s3.destroy();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
