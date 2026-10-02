/**
 * Work to finish when the platform stops this worker: Docker and ECS send
 * SIGTERM and wait a while before killing it. Handlers run once, in order;
 * then the process exits as stopped.
 */
type StopHandler = () => Promise<void>;

const handlers = new Set<StopHandler>();
let listening = false;

async function stopNow(): Promise<void> {
  for (const handler of handlers) {
    try {
      await handler();
    } catch {
      // Best effort: the run is cancelled either way.
    }
  }
  process.exit(143);
}

/** Runs `handler` if the worker is stopped before the returned function is called. */
export function onStop(handler: StopHandler): () => void {
  handlers.add(handler);
  if (!listening) {
    listening = true;
    process.once("SIGTERM", () => void stopNow());
  }
  return () => handlers.delete(handler);
}
