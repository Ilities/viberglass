import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

function generateRateLimitKey(req: Request): string {
  const user = (req as any).user;
  if (user?.id) {
    return `user:${user.id}`;
  }
  return req.ip || "unknown";
}

function rateLimitExceededHandler(req: Request, res: Response): void {
  res.status(429).json({
    error: "Too Many Requests",
    message: "Rate limit exceeded. Please try again later.",
  });
}

/**
 * General API rate limiter: 100 requests per 15 minutes
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: generateRateLimitKey,
  handler: rateLimitExceededHandler,
  skip: (req) => req.path === "/health",
});

/**
 * Auth rate limiter: 5 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitExceededHandler,
});

/**
 * Webhook limiter: 1000 per 15 minutes
 */
export const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitExceededHandler,
});
