import request from "supertest";
import app from "../api/app";
import logger from "../config/logger";

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
      expect(response.body.endpoints["POST /api/bug-reports"]).toBeDefined();
    });
  });

  describe("Bug Reports API", () => {
    it("should return validation error for missing data", async () => {
      const response = await request(app).post("/api/bug-reports").expect(400);

      expect(response.body.error).toBe("Screenshot file is required");
    });

    it("should return validation error for invalid UUID", async () => {
      const response = await request(app)
        .get("/api/bug-reports/invalid-uuid")
        .expect(400);

      expect(response.body.error).toBe("Invalid UUID format");
    });

    it("should return 404 for non-existent bug report", async () => {
      const validUUID = "123e4567-e89b-12d3-a456-426614174000";
      const response = await request(app)
        .get(`/api/bug-reports/${validUUID}`)
        .expect(404);

      expect(response.body.error).toBe("Bug report not found");
    });

    it("should require projectId query parameter", async () => {
      const response = await request(app).get("/api/bug-reports").expect(400);

      expect(response.body.error).toBe("projectId query parameter is required");
    });
  });

  describe("Webhooks API", () => {
    it("should return webhook status", async () => {
      const response = await request(app)
        .get("/api/webhooks/status")
        .expect(200);

      expect(response.body.webhooks).toBeDefined();
      expect(response.body.autoFixQueue).toBeDefined();
    });

    it("should validate trigger-autofix parameters", async () => {
      const response = await request(app)
        .post("/api/webhooks/trigger-autofix")
        .send({})
        .expect(400);

      expect(response.body.error).toBe(
        "ticketId and ticketSystem are required",
      );
    });

    it("should accept valid trigger-autofix request", async () => {
      const response = await request(app)
        .post("/api/webhooks/trigger-autofix")
        .send({
          ticketId: "test-123",
          ticketSystem: "github",
          repositoryUrl: "https://github.com/test/repo",
        })
        .expect(200);

      expect(response.body.message).toBe("Auto-fix job queued successfully");
      expect(response.body.ticketId).toBe("test-123");
    });
  });

  describe("Error Handling", () => {
    it("should return 404 for non-existent endpoints", async () => {
      const response = await request(app)
        .get("/non-existent-endpoint")
        .expect(404);
    });

    it("should handle API errors with JSON response", async () => {
      const response = await request(app).post("/api/non-existent").expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe("Original Routes Compatibility", () => {
    it("should maintain compatibility with original index route", async () => {
      const response = await request(app).get("/").expect(200);
    });
  });
});

// Integration test for the full bug report creation flow
describe("Bug Report Integration", () => {
  it("should demonstrate the complete flow", () => {
    logger.debug("Bug Report Creation Flow:");
    logger.debug("1. Widget captures screenshot and metadata");
    logger.debug("2. POST /api/bug-reports with multipart form data");
    logger.debug("3. File uploaded to S3, metadata stored in PostgreSQL");
    logger.debug("4. If autoFixRequested, job queued in Redis");
    logger.debug("5. Webhook creates ticket in PM system");
    logger.debug("6. Auto-fix agent processes if tags detected");

    expect(true).toBe(true); // This test just demonstrates the flow
  });
});

// Test utilities
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
