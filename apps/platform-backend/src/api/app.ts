import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import cookieParser from "cookie-parser";
import createError from "http-errors";
import logger from "../config/logger";
import passport from "passport";
import type { ExtendedRequest } from "../webhooks/middleware/rawBody";

// Import routes
import projectsRouter from "./routes/projects";
import integrationsRouter from "./routes/integrations";
import ticketsRouter from "./routes/tickets";
import webhooksRouter from "./routes/webhooks";
import clankersRouter from "./routes/clankers";
import deploymentStrategiesRouter from "./routes/deployment-strategies";
import jobsRouter from "./routes/jobs";
import secretsRouter from "./routes/secrets";
import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import { attachAuthContext } from "./middleware/authentication";
import { configurePassport } from "./auth/passport";
import {
  maliciousRequestBlocker,
  suspiciousIpTracker,
} from "./middleware/maliciousRequestBlocker";

const app = express();
configurePassport();

// Trust proxy headers when running behind ALB/load balancer
// Required for accurate client IP detection in rate limiting and logging
// Set to 1 to trust only the first proxy (ALB) - more secure than 'true'
app.set("trust proxy", 1);

// Security headers with helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow inline scripts for Next.js
    crossOriginEmbedderPolicy: false, // Allow embedding from same origin
  }),
);

// Block malicious/bot scanning requests early
app.use(maliciousRequestBlocker);
app.use(suspiciousIpTracker);

// HTTP request logging middleware with Winston
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.http("HTTP Request", {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });

  next();
});

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      const request = req as unknown as ExtendedRequest & { url?: string };
      if ((request.url || "").startsWith("/api/webhooks")) {
        request.rawBody = Buffer.from(buf);
      }
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

// CORS configuration - strict for production, permissive for development
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:3000",
  "http://localhost:3001",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn("CORS blocked request from unauthorized origin", {
          origin,
        });
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-Id"],
  }),
);

app.use(passport.initialize());
app.use(attachAuthContext);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Root path - return API info
app.get("/", (req, res) => {
  res.json({
    name: "Viberglass API",
    version: "1.0.0",
    health: "/health",
  });
});

// API routes
app.use("/api/projects", projectsRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/clankers", clankersRouter);
app.use("/api/deployment-strategies", deploymentStrategiesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/secrets", secretsRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  // Log 404 errors with request details for debugging
  logger.warn("Route not found", {
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next(createError(404));
});

// Error handler
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    // Set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};

    // Log error with more context for 404s
    const logData: Record<string, unknown> = {
      message: err.message,
      stack: err.stack,
      status: err.status,
    };

    if (err.status === 404) {
      logData.method = req.method;
      logData.url = req.url;
      logData.originalUrl = req.originalUrl;
      logData.path = req.path;
      logData.routes = req.app._router?.stack
        ?.filter((layer: any) => layer.route || layer.name === "router")
        ?.map((layer: any) => ({
          name: layer.name,
          regexp: layer.regexp?.toString(),
          path: layer.route?.path,
        }));
    }

    logger.error("Application error", logData);

    // Send error response
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
      ...(req.app.get("env") === "development" && { stack: err.stack }),
    });
  },
);

export default app;
