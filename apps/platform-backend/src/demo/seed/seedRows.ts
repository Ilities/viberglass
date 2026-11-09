import type { BundleTable } from "../bundle/bundleManifest";
import type { Row } from "../bundle/jsonValues";
import { rewriteBucketUrls } from "../bundle/s3Urls";
import { SEED_OVERRIDES, type SeedSecrets } from "./seedOverrides";

export interface SeedRowContext {
  sourceBucket: string;
  targetBucket: string;
  /** Turns a bundle offset into the time the seed writes. */
  shift: (offset: number) => Date;
  secrets: SeedSecrets;
}

/** A bundle row as the target database takes it: times shifted, storage URLs on the target bucket, overrides applied. */
export function seedRow(table: BundleTable, row: Row, context: SeedRowContext): Row {
  const timestamps = new Set(table.timestampColumns);
  const seeded: Row = {};
  for (const [column, value] of Object.entries(row)) {
    if (timestamps.has(column)) seeded[column] = typeof value === "number" ? context.shift(value).toISOString() : null;
    else seeded[column] = rewriteBucketUrls(value, context.sourceBucket, context.targetBucket);
  }
  const override = SEED_OVERRIDES[table.name];
  return override ? override(seeded, context.secrets) : seeded;
}
