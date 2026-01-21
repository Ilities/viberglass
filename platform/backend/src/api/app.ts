import express from "express";
import cors from "cors";
import path from "path";
import cookieParser from "cookie-parser";
import createError from "http-errors";
import logger from "../config/logger";

// Import routes
import projectsRouter from "./routes/projects";
import ticketsRouter from "./routes/tickets";
import webhooksRouter from "./routes/webhooks";
import clankersRouter from "./routes/clankers";
import deploymentStrategiesRouter from "./routes/deployment-strategies";
import jobsRouter from "./routes/jobs";

const app = express();

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

app.use(express.json({ limit: "10mb" })); // Increased limit for file uploads
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API routes
app.use("/api/projects", projectsRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/clankers", clankersRouter);
app.use("/api/deployment-strategies", deploymentStrategiesRouter);
app.use("/api/jobs", jobsRouter);

// API documentation endpoint
app.get("/api/docs", (req, res) => {
  const docs = {
    version: "1.0.0",
    title: "ViBug Receiver API",
    description: "Ticket capture and PM system integration API",
    endpoints: {
      "POST /api/tickets": {
        description: "Create a new ticket",
        parameters: {
          "multipart/form-data": {
            screenshot: "Required image file",
            recording: "Optional video file",
            projectId: "UUID of the project",
            title: "Ticket title",
            description: "Ticket description",
            severity: "low|medium|high|critical",
            category: "Ticket category",
            metadata: "Technical metadata object",
            annotations: "Array of annotations",
            autoFixRequested: "Boolean",
            ticketSystem: "Target PM system",
          },
        },
        responses: {
          201: "Ticket created successfully",
          400: "Validation error",
          500: "Internal server error",
        },
      },
      "GET /api/tickets/:id": {
        description: "Get a specific ticket",
        parameters: {
          id: "UUID of the ticket",
        },
      },
      "GET /api/tickets": {
        description: "Get tickets by project",
        parameters: {
          projectId: "UUID of the project (query param)",
          limit: "Number of results (default: 50)",
          offset: "Result offset (default: 0)",
        },
      },
      "PUT /api/tickets/:id": {
        description: "Update a ticket",
        parameters: {
          id: "UUID of the ticket",
        },
      },
      "DELETE /api/tickets/:id": {
        description: "Delete a ticket",
        parameters: {
          id: "UUID of the ticket",
        },
      },
      "POST /api/webhooks/github": {
        description: "GitHub webhook endpoint",
        headers: {
          "X-GitHub-Event": "GitHub event type",
          "X-Hub-Signature-256": "GitHub signature",
        },
      },
      "POST /api/webhooks/linear": {
        description: "Linear webhook endpoint",
      },
      "POST /api/webhooks/jira": {
        description: "Jira webhook endpoint",
      },
      "GET /api/webhooks/status": {
        description: "Get webhook processing status",
      },
      "POST /api/webhooks/trigger-autofix": {
        description: "Manually trigger auto-fix for a ticket",
        parameters: {
          ticketId: "ID of the external ticket",
          ticketSystem: "PM system name",
          repositoryUrl: "Optional repository URL",
        },
      },
      "POST /api/jobs": {
        description: "Submit a job for AI agent execution",
        parameters: {
          repository: "Repository URL (required)",
          task: "Task description (required)",
          branch: "Target branch (default: main)",
          baseBranch: "Base branch (default: main)",
          context: "Additional context object",
          settings: "Execution settings object",
          tenantId: "Tenant identifier (default: api-server)",
        },
      },
      "GET /api/jobs/:jobId": {
        description: "Get job status and details",
        parameters: {
          jobId: "Job identifier",
        },
      },
      "GET /api/jobs": {
        description: "List jobs",
        parameters: {
          status: "Filter by job status (optional)",
          limit: "Number of results (default: 10)",
        },
      },
      "DELETE /api/jobs/:jobId": {
        description: "Delete a job",
        parameters: {
          jobId: "Job identifier",
        },
      },
      "GET /api/jobs/stats/queue": {
        description: "Get queue statistics",
      },
    },
    examples: {
      createTicket: {
        method: "POST",
        url: "/api/tickets",
        headers: {
          "Content-Type": "multipart/form-data",
        },
        formData: {
          screenshot: "@screenshot.png",
          projectId: "123e4567-e89b-12d3-a456-426614174000",
          title: "Button not clickable on mobile",
          description: "The submit button cannot be clicked on mobile devices",
          severity: "high",
          category: "UI/UX",
          ticketSystem: "github",
          autoFixRequested: true,
          metadata: JSON.stringify({
            browser: { name: "Chrome", version: "91.0.4472.124" },
            os: { name: "Android", version: "11" },
            screen: {
              width: 360,
              height: 640,
              viewportWidth: 360,
              viewportHeight: 640,
              pixelRatio: 3,
            },
            network: {
              userAgent: "Mozilla/5.0...",
              language: "en-US",
              cookiesEnabled: true,
              onLine: true,
            },
            console: [],
            errors: [],
            pageUrl: "https://example.com/checkout",
            timestamp: new Date().toISOString(),
            timezone: "America/New_York",
          }),
          annotations: JSON.stringify([
            { id: "ann1", type: "arrow", x: 100, y: 200, color: "red" },
          ]),
        },
      },
    },
  };

  res.json(docs);
});

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response) => {
  // Set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // Log error
  logger.error("Application error", {
    message: err.message,
    stack: err.stack,
    status: err.status,
  });

  // Send error response
  if (req.path.startsWith("/api/")) {
    // API error response
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
      ...(req.app.get("env") === "development" && { stack: err.stack }),
    });
  } else {
    // Render the error page for web requests
    res.status(err.status || 500);
    res.render("error");
  }
});

export default app;
