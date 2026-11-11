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

function excludedJobIds(rowsOf: RowsOf, ids: readonly string[]): Set<string> {
  const found = idsByColumn(rowsOf("jobs"), "id", new Set(ids));
  const unknown = ids.filter((id) => !found.has(id));
  if (unknown.length > 0) throw new Error(`No job with the id ${unknown.join(", ")}`);
  return new Set(found.values());
}

function excludedTaskIds(rowsOf: RowsOf, keys: readonly string[]): Set<string> {
  const found = idsByColumn(rowsOf("tickets"), "task_key", new Set(keys));
  const unknown = keys.filter((key) => !found.has(key));
  if (unknown.length > 0) throw new Error(`No task with the key ${unknown.join(", ")}`);
  return new Set(found.values());
}

/** Resolves the config's spaces, people, tasks and jobs against the source rows. */
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
  return {
    spaceIds,
    excludedUserIds: new Set(excluded.values()),
    excludedTaskIds: excludedTaskIds(rowsOf, config.excludeTasks),
    excludedJobIds: excludedJobIds(rowsOf, config.excludeJobs),
    jobProjects: jobProjects(rowsOf),
  };
}

/** The exported user who stands in for the shared viewer, if the config names one. */
export function viewerUserId(users: readonly Row[], sourceEmail: string | null): string | null {
  if (!sourceEmail) return null;
  const found = idsByColumn(users, "email", lower([sourceEmail]), (email) => email.toLowerCase());
  const id = found.get(sourceEmail.toLowerCase());
  if (!id) throw new Error(`viewer.sourceEmail ${sourceEmail} is not an exported person`);
  return id;
}
