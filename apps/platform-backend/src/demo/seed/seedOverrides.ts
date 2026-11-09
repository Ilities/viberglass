import type { Row } from "../bundle/jsonValues";

export interface SeedSecrets {
  /** A fresh, unpublished callback token per job, so no worker can report into a seeded run. */
  callbackToken(): string;
  /** A hash of a password nobody knows, for people other than the viewer. */
  lockedPasswordHash: string;
}

type Override = (row: Row, secrets: SeedSecrets) => Row;

const hasValue = (value: unknown): boolean => value !== null && value !== undefined;

/**
 * What the seed sets regardless of what was captured: apps and previews wait
 * to be started by the reconcilers, which never pick up a row already marked
 * running; scheduled template runs stay paused, since the demo has no runner.
 */
export const SEED_OVERRIDES: Readonly<Record<string, Override>> = {
  users: (row, secrets) => ({ ...row, password_hash: secrets.lockedPasswordHash }),
  jobs: (row, secrets) => ({ ...row, callback_token: secrets.callbackToken(), bootstrap_payload: null }),
  apps: (row) => ({
    ...row,
    power: hasValue(row.current_release_id) ? "on" : "off",
    state: "off",
    status_message: null,
    busy_since: null,
    restart_due: false,
    backup_due: false,
    archive_backup_due: false,
    restore_backup_id: null,
    restore_execution_id: null,
  }),
  app_previews: (row) => ({
    ...row,
    power: hasValue(row.release_id) ? "on" : "off",
    state: "off",
    status_message: null,
    busy_since: null,
    running_release_id: null,
  }),
  claw_schedules: (row) => (row.action === "run_template" ? { ...row, is_active: false } : row),
};
