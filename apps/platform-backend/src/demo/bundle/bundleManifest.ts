import { isObjectRecord, type PinTarget } from "@viberglass/types";

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

/** A Home pin for the viewer, titled as the UI titles one: the artifact's title or the App space's name. */
export interface BundlePin {
  target: PinTarget;
  title: string;
}

export interface BundleViewer {
  /** An exported user who stands in for the shared viewer, so their mentions and watches carry over. */
  userId: string | null;
  /** Tasks the viewer watches, by key, such as "APP-12". */
  watchTaskKeys: string[];
  /** Pinned to the viewer's Home in a fresh random order at every seed. */
  pins: BundlePin[];
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

function parsePinTarget(value: unknown): PinTarget | null {
  if (!isObjectRecord(value)) return null;
  if (value.kind === "artifact" && typeof value.artifactId === "string") return { kind: "artifact", artifactId: value.artifactId };
  if (value.kind === "app" && typeof value.spaceId === "string") return { kind: "app", spaceId: value.spaceId };
  return null;
}

function parsePins(value: unknown): BundlePin[] {
  if (!Array.isArray(value)) return [];
  return value.map((pin) => {
    const target = isObjectRecord(pin) ? parsePinTarget(pin.target) : null;
    if (!target || !isObjectRecord(pin) || typeof pin.title !== "string") throw new Error("The bundle manifest has a viewer pin without a target or title");
    return { target, title: pin.title };
  });
}

function parseViewer(value: unknown): BundleViewer {
  if (!isObjectRecord(value)) return { userId: null, watchTaskKeys: [], pins: [] };
  return {
    userId: typeof value.userId === "string" ? value.userId : null,
    watchTaskKeys: isStringList(value.watchTaskKeys) ? value.watchTaskKeys : [],
    pins: parsePins(value.pins),
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
