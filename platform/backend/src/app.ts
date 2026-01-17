import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import createError from "http-errors";

// Import routes
import bugReportsRouter from "./routes/bugReports";
import webhooksRouter from "./routes/webhooks";

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(logger("dev"));
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
app.use("/api/bug-reports", bugReportsRouter);
app.use("/api/webhooks", webhooksRouter);

// API documentation endpoint
app.get("/api/docs", (req, res) => {
  const docs = {
    version: "1.0.0",
    title: "ViBug Receiver API",
    description: "Bug report capture and PM system integration API",
    endpoints: {
      "POST /api/bug-reports": {
        description: "Create a new bug report",
        parameters: {
          "multipart/form-data": {
            screenshot: "Required image file",
            recording: "Optional video file",
            projectId: "UUID of the project",
            title: "Bug report title",
            description: "Bug description",
            severity: "low|medium|high|critical",
            category: "Bug category",
            metadata: "Technical metadata object",
            annotations: "Array of annotations",
            autoFixRequested: "Boolean",
            ticketSystem: "Target PM system",
          },
        },
        responses: {
          201: "Bug report created successfully",
          400: "Validation error",
          500: "Internal server error",
        },
      },
      "GET /api/bug-reports/:id": {
        description: "Get a specific bug report",
        parameters: {
          id: "UUID of the bug report",
        },
      },
      "GET /api/bug-reports": {
        description: "Get bug reports by project",
        parameters: {
          projectId: "UUID of the project (query param)",
          limit: "Number of results (default: 50)",
          offset: "Result offset (default: 0)",
        },
      },
      "PUT /api/bug-reports/:id": {
        description: "Update a bug report",
        parameters: {
          id: "UUID of the bug report",
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
          ticketId: "ID of the ticket",
          ticketSystem: "PM system name",
          repositoryUrl: "Optional repository URL",
        },
      },
    },
    examples: {
      createBugReport: {
        method: "POST",
        url: "/api/bug-reports",
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
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    // Set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};

    // Log error
    console.error("Application error:", err);

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
  },
);

export default app;
