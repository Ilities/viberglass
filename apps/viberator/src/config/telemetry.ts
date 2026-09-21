/**
 * Telemetry bootstrap for the viberator worker.
 *
 * The worker is ephemeral — a Lambda invocation, an ECS task or a Docker
 * container that exists for exactly one job — so the important differences
 * from the backend are that spans must be flushed before the process exits,
 * and that the root span joins the backend's trace via the W3C carrier in the
 * bootstrap payload rather than starting its own.
 */
import { flushTelemetry, startTelemetry } from "@viberglass/telemetry";

export const telemetry = startTelemetry({
  serviceName: "viberglass-viberator",
  serviceVersion: process.env.VIBERGLASS_VERSION || "0.0.0",
});

/**
 * Flushes spans, then exits.
 *
 * Both worker entrypoints call `process.exit` with the job's exit code the
 * moment the result callback returns. `BatchSpanProcessor` buffers, so
 * without an explicit flush the spans for a just-completed job are discarded —
 * precisely the job whose trace matters most. The flush is bounded because a
 * wedged collector must not stop a finished worker from exiting.
 */
export async function shutdownTelemetryAndExit(
  exitCode: number,
  timeoutMs = 5000,
): Promise<never> {
  await settleOrTimeout(
    telemetry.shutdown(),
    timeoutMs,
    "Failed to flush telemetry before exit",
  );
  process.exit(exitCode);
}

/**
 * Flushes without shutting the provider down — for Lambda, whose container is
 * frozen between invocations and reused, so the provider must survive.
 */
export async function flushTelemetryBeforeFreeze(
  timeoutMs = 5000,
): Promise<void> {
  await settleOrTimeout(flushTelemetry(), timeoutMs, "Failed to flush telemetry");
}

/**
 * Awaits `operation`, giving up after `timeoutMs`.
 *
 * The catch is attached to `operation` itself rather than to the race. An
 * unreachable collector makes the export reject — verified: it surfaces as
 * ECONNREFUSED — and if the timeout wins that race, a `.catch` on the race
 * alone would never see the later rejection. That is an unhandled rejection,
 * which is fatal under `--unhandled-rejections=throw`: a telemetry endpoint
 * being down would then take down a worker that had already finished its job.
 */
async function settleOrTimeout(
  operation: Promise<void>,
  timeoutMs: number,
  failureMessage: string,
): Promise<void> {
  const guarded = operation.catch((error: unknown) => {
    console.warn(`${failureMessage}:`, error);
  });

  await Promise.race([
    guarded,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref()),
  ]);
}
