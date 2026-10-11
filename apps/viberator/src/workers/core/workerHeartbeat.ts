import type { Logger } from "winston";

export function startWorkerHeartbeat(send: () => Promise<void>, logger: Pick<Logger, "warn">): () => void {
  let sending = false;
  const timer = setInterval(() => {
    if (sending) return;
    sending = true;
    send().catch(() => logger.warn("Could not deliver worker heartbeat"))
      .finally(() => { sending = false; });
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
