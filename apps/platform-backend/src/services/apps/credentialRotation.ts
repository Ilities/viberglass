import { appDataCredentialSeconds, appRestartHour } from "./appHostingConfig";

const HOUR_MS = 60 * 60 * 1000;

/** For an app started before expiry was recorded: restarted once, in the restart hour. */
export const UNKNOWN_EXPIRY = new Date(0);

export interface RotationSchedule {
  /** How long new credentials last. */
  lifetimeMs: number;
  /** The hour (UTC) a restart that can wait waits for. */
  restartHour: number;
}

export function rotationSchedule(env: Record<string, string | undefined> = process.env): RotationSchedule {
  return { lifetimeMs: appDataCredentialSeconds(env) * 1000, restartHour: appRestartHour(env) };
}

/**
 * Whether a running app should restart for new storage credentials: in the
 * restart hour once its credentials are getting old, or at once when they're
 * about to run out. The window for the restart hour is at least a day longer
 * than the urgent one for week-long credentials, so they always get one.
 */
export function credentialsDue(expiresAt: Date | null, now: Date, schedule: RotationSchedule): boolean {
  if (!expiresAt) return false;
  if (expiresAt.getTime() === UNKNOWN_EXPIRY.getTime()) return now.getUTCHours() === schedule.restartHour;
  const left = expiresAt.getTime() - now.getTime();
  if (left < Math.min(schedule.lifetimeMs / 3, 12 * HOUR_MS)) return true;
  return now.getUTCHours() === schedule.restartHour && left < Math.min(48 * HOUR_MS, schedule.lifetimeMs / 2);
}
