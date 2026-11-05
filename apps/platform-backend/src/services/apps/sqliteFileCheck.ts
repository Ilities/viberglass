import { DatabaseSync } from "node:sqlite";
import { isObjectRecord } from "@viberglass/types";

/** Why a file can't be an app's database, or null when SQLite opens it read-only and finds it intact. */
export function sqliteFileProblem(path: string): string | null {
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(path, { readOnly: true });
  } catch {
    return "That file isn't a SQLite database.";
  }
  try {
    const rows = database.prepare("PRAGMA integrity_check").all();
    const first = rows[0];
    const verdict = isObjectRecord(first) ? first.integrity_check : undefined;
    return verdict === "ok" ? null : "That SQLite database is damaged: its integrity check failed.";
  } catch {
    return "That file isn't a SQLite database.";
  } finally {
    database.close();
  }
}
