import { context as otelContext, trace } from "@opentelemetry/api";
import {
  definedAttributes,
  extractTraceContext,
  getTracer,
  SpanKind,
  SpanStatusCode,
} from "@viberglass/telemetry";
import type { NextFunction, Request, Response } from "express";

/**
 * Opens a SERVER span per HTTP request and makes it the active span for the
 * rest of the request, so anything downstream that starts a span becomes its
 * child and job dispatch can propagate a live trace context to the worker.
 *
 * Hand-rolled rather than `@opentelemetry/instrumentation-http`: the backend
 * is ESM (`"type": "module"`), and the auto-instrumentations patch CommonJS
 * through require-in-the-middle, so they need an `--import` loader hook rather
 * than an in-process call. This covers what Phase 0 actually needs — an
 * ingress span that webhook-triggered job dispatch hangs off — without
 * changing how the process is launched. See packages/telemetry/README.md.
 */
export function tracingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Honour inbound trace context so a caller that is already tracing gets one
  // connected trace rather than two disjoint ones.
  const parentContext = extractTraceContext({
    traceparent: req.header("traceparent"),
    tracestate: req.header("tracestate"),
  });

  const span = getTracer().startSpan(
    `${req.method} ${req.path}`,
    {
      kind: SpanKind.SERVER,
      attributes: definedAttributes({
        "http.request.method": req.method,
        // req.path only — the query string routinely carries tokens.
        "url.path": req.path,
        "url.scheme": req.protocol,
        "server.address": req.hostname,
        "user_agent.original": req.header("user-agent"),
        "client.address": req.ip,
      }),
    },
    parentContext,
  );

  // `finish` and `close` both fire on a normal response, and ending a span
  // twice is a diagnostic warning plus a second export attempt.
  let ended = false;
  const endSpan = (status?: { message: string }): void => {
    if (ended) return;
    ended = true;

    span.setAttribute("http.response.status_code", res.statusCode);

    // Express resolves the route pattern only after routing, so the low
    // cardinality name is read here rather than at span start —
    // `/api/jobs/:jobId` instead of one distinct span name per job id.
    const routePath = (req.route as { path?: string } | undefined)?.path;
    if (routePath) {
      const route = `${req.baseUrl}${routePath}`;
      span.updateName(`${req.method} ${route}`);
      span.setAttribute("http.route", route);
    }

    if (status) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: status.message });
    } else if (res.statusCode >= 500) {
      // Only 5xx is this server's error: a 404, or a webhook rejected for a
      // bad signature, is the service behaving correctly.
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${res.statusCode}`,
      });
    }

    span.end();
  };

  res.on("finish", () => endSpan());
  res.on("close", () => {
    // Client hung up before the response completed — record it rather than
    // leaking an unended span.
    if (!res.writableEnded) {
      endSpan({ message: "connection closed before response completed" });
    }
  });

  otelContext.with(trace.setSpan(parentContext, span), next);
}
