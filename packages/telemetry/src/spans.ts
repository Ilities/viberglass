import {
  context as otelContext,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type AttributeValue,
  type Span,
} from "@opentelemetry/api";

import { ATTR_VG_SEMCONV_REVISION, GENAI_SEMCONV_REVISION } from "./semconv";
import { getTracer } from "./tracing";

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Attributes;
}

/**
 * Drops undefined/null entries.
 *
 * The lifecycle carries a lot of genuinely optional context (ticket id, PR
 * URL, commit SHA). Setting those to `undefined` would either throw in the
 * exporter or land as an empty attribute that reads like "we measured this and
 * it was blank" — different from "not applicable to this job".
 */
export function definedAttributes(
  attributes: Record<string, AttributeValue | undefined | null>,
): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Runs `fn` inside a new active span.
 *
 * On throw the span records the exception, is marked ERROR and re-raised —
 * instrumentation never changes control flow.
 */
export async function withSpan<T>(
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return getTracer().startActiveSpan(
    name,
    {
      kind: options.kind ?? SpanKind.INTERNAL,
      attributes: {
        ...options.attributes,
        [ATTR_VG_SEMCONV_REVISION]: GENAI_SEMCONV_REVISION,
      },
    },
    async (span) => {
      try {
        const result = await fn(span);
        // Leave the status unset on success unless the caller set it: an unset
        // status means "no opinion", which is what the spec wants, and lets a
        // caller mark a completed-but-unsuccessful job as ERROR itself.
        return result;
      } catch (error) {
        recordSpanError(span, error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

/** Marks `span` as failed and attaches the exception. */
export function recordSpanError(span: Span, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error) {
    span.recordException(error);
  } else {
    span.recordException({ message });
  }
  span.setStatus({ code: SpanStatusCode.ERROR, message });
}

/** Marks `span` failed from a message alone — for failures reported as data, not throws. */
export function markSpanFailed(span: Span, message: string): void {
  span.setStatus({ code: SpanStatusCode.ERROR, message });
}

/** The currently active span, if any. */
export function activeSpan(): Span | undefined {
  return trace.getSpan(otelContext.active());
}

/**
 * The active trace and span ids, for correlating log lines with traces.
 *
 * Returns undefined when tracing is disabled, so log output is unchanged in
 * deployments that never configured an exporter.
 */
export function activeTraceIds():
  | { traceId: string; spanId: string }
  | undefined {
  const spanContext = activeSpan()?.spanContext();
  if (!spanContext || !trace.isSpanContextValid(spanContext)) return undefined;
  return { traceId: spanContext.traceId, spanId: spanContext.spanId };
}
