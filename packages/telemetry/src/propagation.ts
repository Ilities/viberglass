import {
  context as otelContext,
  propagation,
  trace,
  type Context,
} from "@opentelemetry/api";

/**
 * W3C trace context as it travels to a worker.
 *
 * The backend dispatches jobs to Lambda, ECS and Docker — there is no HTTP
 * request from backend to worker to carry headers on, so the carrier rides
 * inside the bootstrap payload instead. Field names match the W3C header
 * names so any standard propagator can read it.
 */
export interface TraceCarrier {
  traceparent: string;
  tracestate?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Serialises the active trace context, or undefined when there is no sampled
 * context to propagate (tracing disabled, or outside any span).
 */
export function injectTraceContext(
  ctx: Context = otelContext.active(),
): TraceCarrier | undefined {
  const spanContext = trace.getSpanContext(ctx);
  if (!spanContext || !trace.isSpanContextValid(spanContext)) return undefined;

  const carrier: Record<string, unknown> = {};
  propagation.inject(ctx, carrier);

  const { traceparent, tracestate } = carrier;
  if (!isNonEmptyString(traceparent)) return undefined;

  return isNonEmptyString(tracestate)
    ? { traceparent, tracestate }
    : { traceparent };
}

/**
 * Parses a carrier back into a Context.
 *
 * Returns the active context unchanged when the carrier is absent or
 * unparseable — a worker started from a payload written before this existed,
 * or by a replay tool, must still run.
 */
export function extractTraceContext(carrier: unknown): Context {
  const active = otelContext.active();
  if (!carrier || typeof carrier !== "object") return active;

  const { traceparent, tracestate } = carrier as Record<string, unknown>;
  if (!isNonEmptyString(traceparent)) return active;

  const extracted = propagation.extract(active, {
    traceparent,
    ...(isNonEmptyString(tracestate) ? { tracestate } : {}),
  });

  // propagation.extract returns the input context untouched on a malformed
  // traceparent; checking for a valid span context distinguishes that from a
  // successful extraction.
  const spanContext = trace.getSpanContext(extracted);
  if (!spanContext || !trace.isSpanContextValid(spanContext)) return active;

  return extracted;
}

/** Runs `fn` with the remote trace context from `carrier` active. */
export function withRemoteTraceContext<T>(carrier: unknown, fn: () => T): T {
  return otelContext.with(extractTraceContext(carrier), fn);
}
