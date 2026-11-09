import { appBackupPath, appDataPath, releaseBundleKey } from "@viberglass/types";
import { eachString, idValue, type Row } from "../bundle/jsonValues";
import { objectKeyOf } from "../bundle/s3Urls";

export interface ObjectReferences {
  keys: string[];
  /** Key prefixes ending in "/", every object under which belongs to the export. */
  prefixes: string[];
}

/**
 * The objects exported rows need: everything a row names by `s3://` URL, plus
 * the release bundles, live data and backups of exported apps, whose keys
 * follow from their ids.
 */
export function objectReferences(tables: ReadonlyMap<string, readonly Row[]>, bucket: string, excluded: readonly RegExp[]): ObjectReferences {
  const keys = new Set<string>();
  const prefixes = new Set<string>();
  const add = (key: string) => (key.endsWith("/") ? prefixes : keys).add(key);

  for (const rows of tables.values()) {
    for (const row of rows) {
      eachString(row, (text) => {
        const key = objectKeyOf(text, bucket);
        if (key) add(key);
      });
    }
  }
  for (const app of tables.get("apps") ?? []) {
    const projectId = idValue(app, "project_id");
    if (projectId) add(`${appDataPath(projectId)}/`);
  }
  for (const release of tables.get("app_releases") ?? []) {
    const projectId = idValue(release, "project_id");
    const releaseId = idValue(release, "id");
    const hasBundle = release.bundle_sha256 !== null && release.bundle_sha256 !== undefined && release.bundle_purged_at == null;
    if (projectId && releaseId && hasBundle) add(releaseBundleKey(projectId, releaseId));
  }
  for (const backup of tables.get("app_data_backups") ?? []) {
    const projectId = idValue(backup, "project_id");
    const backupId = idValue(backup, "id");
    if (projectId && backupId) add(`${appBackupPath(projectId, backupId)}/`);
  }

  const allowed = (key: string) => !excluded.some((pattern) => pattern.test(key));
  return { keys: [...keys].filter(allowed).sort(), prefixes: [...prefixes].filter(allowed).sort() };
}
