import logger from "../../../config/logger";

/** Hears that a connection of an integration was made, changed or removed. */
export type ConnectionChangeListener = (system: string) => Promise<void>;

const registered: ConnectionChangeListener[] = [];

/** Adds a listener from a module set up at startup (chat) that the integration services can't depend on. */
export function registerConnectionChangeListener(listener: ConnectionChangeListener): void {
  registered.push(listener);
}

/** Tells every listener; one that fails is logged and doesn't undo the change. */
export async function connectionChanged(system: string): Promise<void> {
  for (const listener of registered) {
    await listener(system).catch((error: unknown) => {
      logger.warn("A connection change listener failed", { system, error: error instanceof Error ? error.message : String(error) });
    });
  }
}
