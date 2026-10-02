import type { RecordedActivity } from "../notifications/NotificationService";

/** Hears about every recorded change, e.g. to notify people about it. */
export interface ActivityListener {
  onActivity(activity: RecordedActivity): Promise<void>;
}

const registered: ActivityListener[] = [];

/**
 * Adds a listener every recorder tells, from a module set up at startup (the
 * chat integration) that services can't depend on. Read at each change, so
 * recorders made before it was added hear it too.
 */
export function registerActivityListener(listener: ActivityListener): void {
  registered.push(listener);
}

export function registeredActivityListeners(): readonly ActivityListener[] {
  return registered;
}
