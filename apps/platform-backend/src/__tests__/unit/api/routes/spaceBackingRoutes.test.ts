import { existsSync } from "node:fs";
import { Readable } from "node:stream";
import express, { type Request } from "express";
import request from "supertest";
import { isWorkspaceRole, type SpaceBackingOptions, type SpaceBroughtIn } from "@viberglass/types";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { spaceParamGuard } from "../../../../api/middleware/spaceAccessGuards";
import { registerSpaceBackingRoutes } from "../../../../api/routes/spaceBackingRoutes";
import type { BringInRequest } from "../../../../services/apps/SpaceBringIn";
import { SpaceAccessService } from "../../../../services/spaces/SpaceAccessService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const OPTIONS: SpaceBackingOptions = { appSpacesAvailable: true, nameFitsApp: true, appNameRule: "rule", ejected: null, keepDays: 30 };

function setup() {
  const access = new SpaceAccessService({
    projects: {
      getProject: jest.fn().mockResolvedValue({ id: SPACE_ID, isPrivate: false }),
      findByName: jest.fn().mockResolvedValue(null),
    },
    members: { getRole: jest.fn().mockResolvedValue(null), listVisibleProjectIds: jest.fn().mockResolvedValue([SPACE_ID]) },
  });
  const uploads: Array<string | undefined> = [];
  const services = {
    bringIn: {
      bringIn: jest.fn(async (_projectId: string, _requesterId: string, input: BringInRequest): Promise<SpaceBroughtIn | null> => {
        uploads.push(input.uploadPath);
        return { slug: "laptops", contractTaskId: "task-1", warnings: [] };
      }),
    },
    ejector: { eject: jest.fn(async () => ({ ejectedAt: new Date("2026-11-05T12:00:00Z"), copyBytes: 4096 })) },
    view: {
      options: jest.fn(async (): Promise<SpaceBackingOptions | null> => OPTIONS),
      openLastCopy: jest.fn(async () => ({ filename: "laptops-app-data.db", content: Readable.from([Buffer.from("SQLite format 3\0")]) })),
    },
  };

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    const role = req.headers["x-role"];
    if (isWorkspaceRole(role)) {
      const at = new Date();
      req.authContext = {
        user: { id: "u-1", email: "u@example.com", name: "U", avatarUrl: null, role, createdAt: at, updatedAt: at, deactivatedAt: null },
        session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
        roles: [role],
        permissions: [],
      };
    }
    next();
  });
  const spaces = express.Router();
  spaces.param("projectId", spaceParamGuard(access));
  registerSpaceBackingRoutes(spaces, services, access);
  app.use("/api/spaces", spaces);
  app.use(applicationErrorHandler);
  return { app, services, uploads };
}

describe("switching a space between git and App", () => {
  it("is only offered to maintainers", async () => {
    const { app, services } = setup();

    await request(app).get(`/api/spaces/${SPACE_ID}/backing`).set("x-role", "member").expect(403);
    await request(app).post(`/api/spaces/${SPACE_ID}/backing/app`).set("x-role", "member").field("startFrom", "none").expect(403);
    await request(app).post(`/api/spaces/${SPACE_ID}/backing/git`).set("x-role", "member").expect(403);
    expect(services.bringIn.bringIn).not.toHaveBeenCalled();
    expect(services.ejector.eject).not.toHaveBeenCalled();

    const response = await request(app).get(`/api/spaces/${SPACE_ID}/backing`).set("x-role", "admin").expect(200);
    expect(response.body.data).toEqual(OPTIONS);
  });

  it("brings a space in with an uploaded SQLite file, and removes the upload afterwards", async () => {
    const { app, services, uploads } = setup();

    const response = await request(app)
      .post(`/api/spaces/${SPACE_ID}/backing/app`)
      .set("x-role", "admin")
      .field("startFrom", "upload")
      .field("name", "Laptops")
      .attach("file", Buffer.from("SQLite format 3\0"), "laptops.db")
      .expect(200);

    expect(response.body.data).toEqual({ slug: "laptops", contractTaskId: "task-1", warnings: [] });
    expect(services.bringIn.bringIn).toHaveBeenCalledWith(SPACE_ID, "u-1", expect.objectContaining({ name: "Laptops", startFrom: "upload" }));
    expect(uploads[0]).toEqual(expect.any(String));
    expect(existsSync(uploads[0] ?? "")).toBe(false);
  });

  it("asks what data the app starts with", async () => {
    const { app } = setup();
    await request(app).post(`/api/spaces/${SPACE_ID}/backing/app`).set("x-role", "admin").field("startFrom", "everything").expect(400);
  });

  it("ejects the app", async () => {
    const { app } = setup();

    const response = await request(app).post(`/api/spaces/${SPACE_ID}/backing/git`).set("x-role", "admin").expect(200);
    expect(response.body.data).toEqual({ ejectedAt: "2026-11-05T12:00:00.000Z", bytes: 4096 });
  });

  it("downloads the last copy of an ejected app's data", async () => {
    const { app } = setup();

    await request(app).get(`/api/spaces/${SPACE_ID}/backing/last-app-data`).set("x-role", "member").expect(403);
    const response = await request(app)
      .get(`/api/spaces/${SPACE_ID}/backing/last-app-data`)
      .set("x-role", "admin")
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(response.headers["content-disposition"]).toContain("laptops-app-data.db");
    expect(Buffer.isBuffer(response.body) && response.body.toString()).toBe("SQLite format 3\0");
  });
});
