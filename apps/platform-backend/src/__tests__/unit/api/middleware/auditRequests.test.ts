import express from "express";
import request from "supertest";
import { auditRequests, changedFields, type AuditRule } from "../../../../api/middleware/auditRequests";

const RULES: AuditRule[] = [
  { method: "POST", path: "/", action: "secret.created", targetType: "secret", details: (req) => ({ name: req.body.name }) },
  { method: "PUT", path: "/:id", action: "secret.updated", targetType: "secret", targetParam: "id", details: changedFields },
];

function appWith(audit: { record: jest.Mock }) {
  const router = express.Router();
  router.get("/", (_req, res) => res.json({ data: [] }));
  router.post("/", (_req, res) => res.status(201).json({ success: true, data: { id: "secret-1", value: "hunter2" } }));
  router.put("/:id", (req, res) => (req.params.id === "missing" ? res.status(404).json({ error: "Not found" }) : res.json({ success: true })));
  router.delete("/:id", (_req, res) => res.json({ success: true }));
  const app = express();
  app.use(express.json());
  app.use("/api/secrets", auditRequests(RULES, audit), router);
  return app;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("auditRequests", () => {
  it("records a created thing by the id the response returned, with only the listed details", async () => {
    const audit = { record: jest.fn() };
    await request(appWith(audit)).post("/api/secrets").send({ name: "GITHUB_TOKEN", value: "hunter2" }).expect(201);
    await settle();

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "secret.created", target: { type: "secret", id: "secret-1" }, details: { name: "GITHUB_TOKEN" } }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("hunter2");
  });

  it("records a change by its route parameter, naming the fields but not their values", async () => {
    const audit = { record: jest.fn() };
    await request(appWith(audit)).put("/api/secrets/secret-1").send({ value: "hunter2", name: "X" }).expect(200);
    await settle();

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "secret.updated", target: { type: "secret", id: "secret-1" }, details: { fields: ["name", "value"] } }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("hunter2");
  });

  it("records nothing for reads, failures, or routes the table doesn't list", async () => {
    const audit = { record: jest.fn() };
    const app = appWith(audit);
    await request(app).get("/api/secrets").expect(200);
    await request(app).put("/api/secrets/missing").send({}).expect(404);
    await request(app).delete("/api/secrets/secret-1").expect(200);
    await settle();

    expect(audit.record).not.toHaveBeenCalled();
  });
});
