import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import createError from "http-errors";
import logger from "../../config/logger";

type Layer = {
  route?: { path: string };
  name: string;
  regexp?: RegExp;
};

function isLowSignalNotFoundRequest(req: Request): boolean {
  return !req.path.startsWith("/api/");
}

function buildNotFoundMetadata(req: Request): Record<string, unknown> {
  return {
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  const metadata = buildNotFoundMetadata(req);

  if (isLowSignalNotFoundRequest(req)) {
    logger.debug("Route not found (low signal)", metadata);
  } else {
    logger.warn("Route not found", metadata);
  }

  next(createError(404));
};

export const applicationErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  _next,
) => {
  if (err.status === 404) {
    res.status(404).json({
      error: err.message || "Not Found",
    });
    return;
  }

  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  const logData: Record<string, unknown> = {
    message: err.message,
    stack: err.stack,
    status: err.status,
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    routes: req.app._router?.stack
      ?.filter((layer: Layer) => layer.route || layer.name === "router")
      ?.map((layer: Layer) => ({
        name: layer.name,
        regexp: layer.regexp?.toString(),
        path: layer.route?.path,
      })),
  };

  logger.error("Application error", logData);

  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    ...(req.app.get("env") === "development" && { stack: err.stack }),
  });
};
