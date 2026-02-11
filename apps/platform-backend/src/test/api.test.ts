import type { Express } from "express";
import request from "supertest";
import logger from "../config/logger";

let app: Express;

beforeAll(async () => {
  // Keep this suite isolated from runtime auth/session requirements.
  process.env.AUTH_ENABLED = "false";
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY =
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY || "test-webhook-secret";

  const module = await import("../api/app");
  app = module.default;
});

describe("API Endpoints", () => {
  describe("Health Check", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/health").expect(200);

      expect(response.body.status).toBe("ok");
      expect(response.body.version).toBe("1.0.0");
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe("API Documentation", () => {
    it("should return API documentation", async () => {
      const response = await request(app).get("/api/docs").expect(200);

      expect(response.body.title).toBe("Viberglass Receiver API");
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.endpoints["POST /api/tickets"]).toBeDefined();
    });
  });

  describe("Tickets API", () => {
    it("should return validation error for missing ticket data", async () => {
      const response = await request(app).post("/api/tickets").expect(400);

      expect(response.body.error).toBeDefined();
    });

    it("should return validation error for invalid UUID", async () => {
      const response = await request(app)
        .get("/api/tickets/invalid-uuid")
        .expect(400);

      expect(response.body.error).toBe("Invalid UUID format");
    });

    it("should allow listing tickets without projectId", async () => {
      const response = await request(app).get("/api/tickets").expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("Webhooks API", () => {
    it("should return webhook status", async () => {
      const response = await request(app)
        .get("/api/webhooks/status")
        .expect(200);

      expect(response.body.status).toBeDefined();
      expect(response.body.providers).toBeDefined();
    });

    it("should return 404 for removed generic webhook management routes", async () => {
      await request(app).get("/api/webhooks/configs").expect(404);
      await request(app).post("/api/webhooks/configs").send({ provider: "github" }).expect(404);
      await request(app).put("/api/webhooks/configs/cfg-1").send({}).expect(404);
      await request(app).delete("/api/webhooks/configs/cfg-1").expect(404);
      await request(app).get("/api/webhooks/deliveries").expect(404);
      await request(app).post("/api/webhooks/deliveries/d-1/retry").expect(404);
      await request(app).post("/api/webhooks/trigger-autofix").send({}).expect(404);
    });

    it("should return 404 for removed project-scoped webhook routes", async () => {
      await request(app).get("/api/projects/proj-1/integrations/github/webhook").expect(404);
      await request(app)
        .put("/api/projects/proj-1/integrations/github/webhook")
        .send({})
        .expect(404);
      await request(app).delete("/api/projects/proj-1/integrations/github/webhook").expect(404);
      await request(app).get("/api/projects/proj-1/integrations/github/deliveries").expect(404);
      await request(app)
        .post("/api/projects/proj-1/integrations/github/deliveries/delivery-1/retry")
        .send({})
        .expect(404);
    });
  });

  describe("Error Handling", () => {
    it("should return 404 for non-existent endpoints", async () => {
      await request(app).get("/non-existent-endpoint").expect(404);
    });

    it("should return JSON error for unknown API routes", async () => {
      const response = await request(app).post("/api/non-existent").expect(404);

      expect(response.body.error).toBeDefined();
    });
  });
});

describe("Bug Report Integration", () => {
  it("should demonstrate the complete flow", () => {
    logger.debug("Bug Report Creation Flow:");
    logger.debug("1. Widget captures screenshot and metadata");
    logger.debug("2. POST /api/tickets with multipart form data");
    logger.debug("3. File uploaded to S3, metadata stored in PostgreSQL");
    logger.debug("4. If autoFixRequested, job queued in Redis");
    logger.debug("5. Webhook creates ticket in PM system");
    logger.debug("6. Auto-fix agent processes if tags detected");

    expect(true).toBe(true);
  });
});

export const createMockBugReportData = () => {
  return {
    projectId: "123e4567-e89b-12d3-a456-426614174000",
    title: "Test bug report",
    description: "This is a test bug report",
    severity: "medium",
    category: "UI/UX",
    ticketSystem: "github",
    autoFixRequested: true,
    metadata: {
      browser: { name: "Chrome", version: "91.0" },
      os: { name: "Windows", version: "10" },
      screen: {
        width: 1920,
        height: 1080,
        viewportWidth: 1920,
        viewportHeight: 1080,
        pixelRatio: 1,
      },
      network: {
        userAgent: "test-agent",
        language: "en-US",
        cookiesEnabled: true,
        onLine: true,
      },
      console: [],
      errors: [],
      pageUrl: "https://example.com",
      timestamp: new Date(),
      timezone: "UTC",
    },
    annotations: [],
  };
};
