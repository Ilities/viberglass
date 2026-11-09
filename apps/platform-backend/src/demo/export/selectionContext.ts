import { idValue, textValue, type Row } from "../bundle/jsonValues";
import type { ExportConfig } from "./exportConfig";
import { jobProjects } from "./jobProjects";
import type { SelectionContext } from "./tablePolicies";

type RowsOf = (table: string) => Row[];

const lower = (values: readonly string[]): Set<string> => new Set(values.map((value) => value.toLowerCase()));

function idsByColumn(rows: readonly Row[], column: string, wanted: ReadonlySet<string>, transform = (text: string) => text): Map<string, string> {
  const ids = new Map<string, string>();
  for (const row of rows) {
    const value = textValue(row, column);
    const id = idValue(row, "id");
    if (value !== null && id !== null && wanted.has(transform(value))) ids.set(transform(value), id);
  }
  return ids;
}

/** Resolves the config's spaces and people against the source rows. */
export function selectionContext(rowsOf: RowsOf, config: ExportConfig): SelectionContext {
  const excluded = idsByColumn(rowsOf("users"), "email", lower(config.excludeUsers), (email) => email.toLowerCase());
  let spaceIds: Set<string> | null = null;
  if (config.spaces) {
    const slugs = new Set(config.spaces);
    const found = idsByColumn(rowsOf("projects"), "slug", slugs);
    const unknown = config.spaces.filter((slug) => !found.has(slug));
    if (unknown.length > 0) throw new Error(`No space with the slug ${unknown.join(", ")}`);
    spaceIds = new Set(found.values());
  }
  return { spaceIds, excludedUserIds: new Set(excluded.values()), jobProjects: jobProjects(rowsOf) };
}

/** The exported user who stands in for the shared viewer, if the config names one. */
export function viewerUserId(users: readonly Row[], sourceEmail: string | null): string | null {
  if (!sourceEmail) return null;
  const found = idsByColumn(users, "email", lower([sourceEmail]), (email) => email.toLowerCase());
  const id = found.get(sourceEmail.toLowerCase());
  if (!id) throw new Error(`viewer.sourceEmail ${sourceEmail} is not an exported person`);
  return id;
}
