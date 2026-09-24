import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { existsSync } from "fs";
import cookieParser from "cookie-parser";
import logger from "../config/logger";
import passport from "passport";
import type { ExtendedRequest } from "../webhooks/middleware/rawBody";

import projectsRouter from "./routes/projects";
import integrationsRouter from "./routes/integrations";
import ticketsRouter from "./routes/tickets";
import webhooksRouter from "./routes/webhooks";
import clankersRouter from "./routes/clankers";
import deploymentStrategiesRouter from "./routes/deployment-strategies";
import jobsRouter from "./routes/jobs";
import secretsRouter from "./routes/secrets";
import setupRouter from "./routes/setup";
import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import clawRouter from "./routes/claw";
import agentSessionsRouter from "./routes/agentSessions";
import promptTemplatesRouter from "./routes/promptTemplates";
import apiTokensRouter from "./routes/apiTokens";
import { attachAuthContext } from "./middleware/authentication";
import { configurePassport } from "./auth/passport";
import {
  maliciousRequestBlocker,
  suspiciousIpTracker,
} from "./middleware/maliciousRequestBlocker";
import {
  notFoundHandler,
  applicationErrorHandler,
} from "./middleware/notFoundHandling";
import mcpRouter from "./routes/mcp";
import { tracingMiddleware } from "./middleware/tracing";
import { requireRole } from "./middleware/authentication";
import { adminOnlyChanges } from "./middleware/adminOnlyChanges";

function resolvePublicDirectory(): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "src/public"),
    path.resolve(cwd, "dist/public"),
    path.resolve(cwd, "apps/platform-backend/src/public"),
    path.resolve(cwd, "apps/platform-backend/dist/public"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

const app = express();
configurePassport();

// Trust proxy headers when running behind ALB/load balancer
// Required for accurate client IP detection in rate limiting and logging
// Set to 1 to trust only the first proxy (ALB) - more secure than 'true'
app.set("trust proxy", 1);

// Security headers with helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow inline scripts
    crossOriginEmbedderPolicy: false, // Allow embedding from same origin
  }),
);

// Block malicious/bot scanning requests early
app.use(maliciousRequestBlocker);
app.use(suspiciousIpTracker);

// Tracing after the blocker so scanner traffic doesn't generate spans, and
// before everything else so the whole request is inside the server span.
app.use(tracingMiddleware);

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
app.use(
  express.urlencoded({
    extended: false,
    limit: "10mb",
    verify: (req, _res, buf) => {
      const request = req as unknown as ExtendedRequest & { url?: string };
      if ((request.url || "").startsWith("/api/webhooks")) {
        request.rawBody = Buffer.from(buf);
      }
    },
  }),
);
app.use(cookieParser());
app.use(express.static(resolvePublicDirectory()));

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

      if (
        allowedOrigins.includes(origin) ||
        origin.startsWith("chrome-extension://")
      ) {
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
// Project links stay open: linking an integration is project configuration.
app.use(
  "/api/integrations",
  adminOnlyChanges({ exemptPathPrefixes: ["/project/"] }),
  integrationsRouter,
);
app.use("/api/tickets", ticketsRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/clankers", adminOnlyChanges(), clankersRouter);
app.use("/api/deployment-strategies", adminOnlyChanges(), deploymentStrategiesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/secrets", requireRole("admin"), secretsRouter);
app.use("/api/setup", requireRole("admin"), setupRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/claw", clawRouter);
app.use("/api/agent-sessions", agentSessionsRouter);
app.use("/api/prompt-templates", adminOnlyChanges(), promptTemplatesRouter);
app.use("/api/api-tokens", apiTokensRouter);
app.use("/api/mcp", mcpRouter);

app.use(notFoundHandler);
app.use(applicationErrorHandler);

export default app;
