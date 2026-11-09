/**
 * Exports a capture instance's workspace as a demo fixture bundle. See ../README.md.
 *
 *   npx tsx src/demo/export/exportDemo.ts --out ../demo-bundle [--config demo-export.json]
 */
import { readFileSync } from "fs";
import { parseArgs } from "util";
import { S3Client } from "@aws-sdk/client-s3";
import { Pool, types } from "pg";
import { objectStorageClientConfig } from "@viberglass/types";
import { DatabaseSchema } from "../bundle/DatabaseSchema";
import { BundleWriter } from "./BundleWriter";
import { DemoExporter } from "./DemoExporter";
import { DEFAULT_EXPORT_CONFIG, parseExportConfig } from "./exportConfig";
import { ObjectExporter } from "./ObjectExporter";
import { SourceDatabase } from "./SourceDatabase";

const TIMESTAMP_WITHOUT_TIME_ZONE = 1114;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

/** The source's storage settings, under the names the shared storage config reads. */
function sourceStorageEnv(): Record<string, string | undefined> {
  const env = process.env;
  return {
    S3_ENDPOINT: env.DEMO_SOURCE_S3_ENDPOINT,
    S3_REGION: env.DEMO_SOURCE_S3_REGION ?? "us-east-1",
    S3_FORCE_PATH_STYLE: env.DEMO_SOURCE_S3_FORCE_PATH_STYLE ?? "true",
    S3_ACCESS_KEY_ID: env.DEMO_SOURCE_S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.DEMO_SOURCE_S3_SECRET_ACCESS_KEY,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: "string" }, config: { type: "string" } } });
  if (!values.out) throw new Error("Pass --out <directory>");
  const config = values.config ? parseExportConfig(JSON.parse(readFileSync(values.config, "utf8"))) : DEFAULT_EXPORT_CONFIG;
  const bucket = required("DEMO_SOURCE_S3_BUCKET");

  const pool = new Pool({
    connectionString: required("DEMO_SOURCE_DATABASE_URL"),
    // The export only reads; the connection refuses writes.
    options: "-c default_transaction_read_only=on",
    types: {
      getTypeParser: (oid: number, format?: "text" | "binary") =>
        oid === TIMESTAMP_WITHOUT_TIME_ZONE && format !== "binary"
          ? (value: string) => new Date(`${value.replace(" ", "T")}Z`)
          : types.getTypeParser(oid, format ?? "text"),
    },
  });
  const s3 = new S3Client(objectStorageClientConfig(sourceStorageEnv()));
  try {
    const database = new SourceDatabase(pool);
    const schema = new DatabaseSchema(pool);
    const exporter = new DemoExporter(
      { schema: () => schema.read(), rows: (table) => database.rows(table), forbiddenValues: (columns) => database.forbiddenValues(columns) },
      new BundleWriter(values.out),
      (directory) => new ObjectExporter(s3, bucket, directory),
      config,
      bucket,
      (line) => console.log(line),
    );
    const manifest = await exporter.export(new Date());
    for (const table of manifest.tables) console.log(`${table.name}: ${table.rows}`);
    console.log(`Wrote ${manifest.objects.length} objects and ${manifest.tables.length} tables to ${values.out}`);
  } finally {
    s3.destroy();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
