import express from "express";
import request from "supertest";
import { APP_DATABASE_PATH, APP_MANIFEST_FILE, APP_USER_HEADERS } from "@viberglass/types";
import { registerSkillCallbackRoute } from "../../../../api/routes/jobs/skillCallbackRoute";
import { APP_CONTRACT_SKILL } from "../../../../services/skills/appContractSkill";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));
jest.mock("../../../../api/middleware/callbackTokenValidation", () => ({
  validateCallbackToken: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../../../../api/middleware/tenantValidation", () => ({
  tenantMiddleware: (req: { tenantId?: string }, _res: unknown, next: () => void) => {
    req.tenantId = "api-server";
    next();
  },
}));

const UPLOADED = { id: "8d4c1f0e-6a0b-4c55-9d43-0f1f8e6b2a10", name: "pdf-forms" };

function setup(skills: Array<{ id: string; name: string }>) {
  const bootstraps = {
    getBootstrapPayload: jest.fn().mockResolvedValue({ tenantId: "api-server", payload: { skills } }),
  };
  const uploaded = {
    files: jest.fn().mockResolvedValue({ name: "pdf-forms", files: [{ path: "SKILL.md", contentBase64: "eA==" }] }),
  };
  const app = express();
  const router = express.Router();
  registerSkillCallbackRoute(router, { bootstraps, skills: uploaded });
  app.use("/api/jobs", router);
  return { app, uploaded };
}

describe("a worker downloading a skill", () => {
  it("gets the app contract skill from the platform, not from uploaded skills", async () => {
    const { app, uploaded } = setup([UPLOADED, APP_CONTRACT_SKILL]);

    const response = await request(app).get(`/api/jobs/job-1/skills/${APP_CONTRACT_SKILL.id}`);

    expect(response.status).toBe(200);
    expect(uploaded.files).not.toHaveBeenCalled();
    expect(response.body.data.name).toBe("viberglass-app");
    expect(response.body.data.files).toHaveLength(1);
    expect(response.body.data.files[0].path).toBe("SKILL.md");
    const skillMd = Buffer.from(response.body.data.files[0].contentBase64, "base64").toString("utf8");
    expect(skillMd).toMatch(/^---\nname: viberglass-app\ndescription: /);
    for (const term of [APP_MANIFEST_FILE, APP_DATABASE_PATH, APP_USER_HEADERS.id, APP_USER_HEADERS.email, APP_USER_HEADERS.name, "/healthz", "$PORT"]) {
      expect(skillMd).toContain(term);
    }
  });

  it("refuses the app contract skill to a run that wasn't given it", async () => {
    const { app } = setup([UPLOADED]);

    const response = await request(app).get(`/api/jobs/job-1/skills/${APP_CONTRACT_SKILL.id}`);

    expect(response.status).toBe(404);
  });

  it("still reads uploaded skills from storage", async () => {
    const { app, uploaded } = setup([UPLOADED, APP_CONTRACT_SKILL]);

    const response = await request(app).get(`/api/jobs/job-1/skills/${UPLOADED.id}`);

    expect(response.status).toBe(200);
    expect(uploaded.files).toHaveBeenCalledWith(UPLOADED.id);
    expect(response.body.data.name).toBe("pdf-forms");
  });
});
