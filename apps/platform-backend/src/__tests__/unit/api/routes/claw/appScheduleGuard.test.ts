import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { appScheduleGuard } from "../../../../../api/routes/claw/appScheduleGuard";

const schedules: Record<string, { projectId: string; action: string }> = {
  "app-schedule": { projectId: "space-1", action: "app_stop" },
  "template-schedule": { projectId: "space-1", action: "run_template" },
};

function app(assertCanMaintain: jest.Mock) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res, next) => {
    req.authContext = { user: { id: "u-1", role: "member" } } as Request["authContext"];
    next();
  });
  const guard = appScheduleGuard({ assertCanMaintain }, { getSchedule: async (id: string) => (schedules[id] as never) ?? null });
  a.post("/schedules", guard, (_req, res) => res.json({ ok: true }));
  a.put("/schedules/:id", guard, (_req, res) => res.json({ ok: true }));
  a.use((error: Error, _req: Request, res: Response, _next: NextFunction) => res.status(403).json({ error: error.message }));
  return a;
}

const notMaintainer = () => jest.fn().mockRejectedValue(new Error("Only maintainers"));

describe("appScheduleGuard", () => {
  it("lets a member create a schedule that runs a template", async () => {
    const assertCanMaintain = notMaintainer();
    await request(app(assertCanMaintain)).post("/schedules").send({ projectId: "space-1", action: "run_template" }).expect(200);
    await request(app(assertCanMaintain)).post("/schedules").send({ projectId: "space-1" }).expect(200);
    expect(assertCanMaintain).not.toHaveBeenCalled();
  });

  it("refuses a member who creates a schedule that turns the app off", async () => {
    const assertCanMaintain = notMaintainer();
    await request(app(assertCanMaintain)).post("/schedules").send({ projectId: "space-1", action: "app_stop" }).expect(403);
    expect(assertCanMaintain).toHaveBeenCalledWith({ id: "u-1", role: "member" }, "space-1");
  });

  it("refuses a member who changes an app schedule, but not a template one", async () => {
    const assertCanMaintain = notMaintainer();
    await request(app(assertCanMaintain)).put("/schedules/app-schedule").send({ name: "x" }).expect(403);
    await request(app(assertCanMaintain)).put("/schedules/template-schedule").send({ name: "x" }).expect(200);
  });

  it("lets a maintainer through", async () => {
    const assertCanMaintain = jest.fn().mockResolvedValue("space-1");
    await request(app(assertCanMaintain)).put("/schedules/app-schedule").send({ name: "x" }).expect(200);
  });
});
