import { isObjectRecord } from "@viberglass/types";

export const BUNDLE_FORMAT = 1;
export const MANIFEST_FILE = "manifest.json";

export const tableFile = (table: string): string => `tables/${table}.json`;
export const objectFile = (key: string): string => `objects/${key}`;

export interface BundleTable {
  name: string;
  rows: number;
  /** Columns whose values are offsets in milliseconds from the export. */
  timestampColumns: string[];
}

export interface BundleViewer {
  /** An exported user who stands in for the shared viewer, so their mentions and watches carry over. */
  userId: string | null;
  /** Tasks the viewer watches, by key, such as "APP-12". */
  watchTaskKeys: string[];
}

export interface BundleManifest {
  format: number;
  /** The bucket that `s3://` URLs in the rows point at. */
  sourceBucket: string;
  newestActivityOffsetMs: number;
  /** Tables in the order they were exported. */
  tables: BundleTable[];
  /** Object keys, each stored under objects/. */
  objects: string[];
  contentTypes: Record<string, string>;
  viewer: BundleViewer;
}

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

function parseTable(value: unknown): BundleTable {
  if (!isObjectRecord(value) || typeof value.name !== "string" || typeof value.rows !== "number" || !isStringList(value.timestampColumns)) {
    throw new Error("The bundle manifest lists a table without a name, row count or timestamp columns");
  }
  return { name: value.name, rows: value.rows, timestampColumns: value.timestampColumns };
}

function parseViewer(value: unknown): BundleViewer {
  if (!isObjectRecord(value)) return { userId: null, watchTaskKeys: [] };
  return {
    userId: typeof value.userId === "string" ? value.userId : null,
    watchTaskKeys: isStringList(value.watchTaskKeys) ? value.watchTaskKeys : [],
  };
}

function parseContentTypes(value: unknown): Record<string, string> {
  const types: Record<string, string> = {};
  if (isObjectRecord(value)) for (const [key, type] of Object.entries(value)) if (typeof type === "string") types[key] = type;
  return types;
}

export function parseBundleManifest(value: unknown): BundleManifest {
  if (!isObjectRecord(value) || value.format !== BUNDLE_FORMAT) {
    throw new Error(`The bundle manifest is not format ${BUNDLE_FORMAT}`);
  }
  if (typeof value.sourceBucket !== "string" || typeof value.newestActivityOffsetMs !== "number") {
    throw new Error("The bundle manifest has no source bucket or newest activity");
  }
  if (!Array.isArray(value.tables) || !isStringList(value.objects)) {
    throw new Error("The bundle manifest has no table or object list");
  }
  return {
    format: BUNDLE_FORMAT,
    sourceBucket: value.sourceBucket,
    newestActivityOffsetMs: value.newestActivityOffsetMs,
    tables: value.tables.map(parseTable),
    objects: value.objects,
    contentTypes: parseContentTypes(value.contentTypes),
    viewer: parseViewer(value.viewer),
  };
}
