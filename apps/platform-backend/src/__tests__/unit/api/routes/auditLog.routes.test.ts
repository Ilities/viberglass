import express from "express";
import request from "supertest";
import { createAuditLogRouter } from "../../../../api/routes/auditLog";

function appWith(list: jest.Mock) {
  const app = express();
  app.use("/api/audit-log", createAuditLogRouter({ list }));
  return app;
}

describe("GET /api/audit-log", () => {
  it("filters by person, area and page", async () => {
    const list = jest.fn().mockResolvedValue([]);
    const response = await request(appWith(list))
      .get("/api/audit-log?actorId=u-1&area=secret&before=2026-10-01T10:00:00.000Z&limit=2")
      .expect(200);

    expect(list).toHaveBeenCalledWith({ actorId: "u-1", targetType: "secret", before: new Date("2026-10-01T10:00:00.000Z"), limit: 2 });
    expect(response.body.data).toEqual({ entries: [], hasMore: false });
  });

  it("refuses an unknown area or date", async () => {
    const list = jest.fn();
    await request(appWith(list)).get("/api/audit-log?area=nope").expect(400);
    await request(appWith(list)).get("/api/audit-log?before=yesterday").expect(400);
    expect(list).not.toHaveBeenCalled();
  });
});
