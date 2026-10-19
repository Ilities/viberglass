import express, { type Request } from "express";
import request from "supertest";
import { isWorkspaceRole } from "@viberglass/types";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { spaceParamGuard } from "../../../../api/middleware/spaceAccessGuards";
import { spaceFilesRouter } from "../../../../api/routes/spaceFilesRoutes";
import { SpaceAccessService } from "../../../../services/spaces/SpaceAccessService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const CHANGE_ID = "22222222-2222-4222-8222-222222222222";
const SAVED = { snapshot: { id: "snap-2" } };

function setup() {
  const access = new SpaceAccessService({
    projects: {
      getProject: jest.fn().mockResolvedValue({ id: SPACE_ID, isPrivate: false }),
      findByName: jest.fn().mockResolvedValue(null),
    },
    // Not a member of the space, nor its maintainer: an open space anyone in the workspace sees.
    members: { getRole: jest.fn().mockResolvedValue(null), listVisibleProjectIds: jest.fn().mockResolvedValue([SPACE_ID]) },
  });
  const files = {
    list: jest.fn().mockResolvedValue({ snapshot: null, files: [], busy: false, changes: [] }),
    readText: jest.fn(),
    saveText: jest.fn().mockResolvedValue(SAVED),
    upload: jest.fn().mockResolvedValue(SAVED),
    remove: jest.fn().mockResolvedValue(SAVED),
    changeContent: jest.fn(),
    dismissChange: jest.fn().mockResolvedValue(undefined),
    download: jest.fn(),
  };
  const artifacts = { list: jest.fn(), detail: jest.fn(), preview: jest.fn(), download: jest.fn() };

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
  // Mounted like the spaces router, whose own routes need a maintainer to change anything.
  const spaces = express.Router();
  spaces.param("projectId", spaceParamGuard(access));
  spaces.put("/:projectId", (_req, res) => res.json({ ok: true }));
  spaces.use(spaceFilesRouter(files, artifacts, access));
  app.use("/api/spaces", spaces);
  app.use(applicationErrorHandler);
  return { app, files, artifacts };
}

describe("changing a Files space's files", () => {
  it("lets a member who can create tasks there upload, edit and delete files, and dismiss waiting changes", async () => {
    const { app, files } = setup();

    await request(app)
      .post(`/api/spaces/${SPACE_ID}/files`)
      .set("x-role", "member")
      .attach("file", Buffer.from("hello"), "notes.md")
      .expect(201);
    await request(app)
      .put(`/api/spaces/${SPACE_ID}/files/text`)
      .set("x-role", "member")
      .send({ path: "notes.md", content: "hi", baseSha256: null })
      .expect(200);
    await request(app).delete(`/api/spaces/${SPACE_ID}/files?path=notes.md`).set("x-role", "member").expect(200);
    await request(app).delete(`/api/spaces/${SPACE_ID}/files/changes/${CHANGE_ID}`).set("x-role", "member").expect(200);

    expect(files.upload).toHaveBeenCalledWith(SPACE_ID, "u-1", "notes.md", expect.any(Buffer));
    expect(files.saveText).toHaveBeenCalled();
    expect(files.remove).toHaveBeenCalledWith(SPACE_ID, "u-1", "notes.md");
    expect(files.dismissChange).toHaveBeenCalledWith(SPACE_ID, CHANGE_ID);
  });

  it("still needs a maintainer for the space's own settings", async () => {
    const { app } = setup();

    const response = await request(app).put(`/api/spaces/${SPACE_ID}`).set("x-role", "member").expect(403);

    expect(response.body.code).toBe("SPACE_NOT_MAINTAINER");
  });

  it("refuses a viewer every change, while they can still read the files", async () => {
    const { app, files } = setup();

    await request(app).get(`/api/spaces/${SPACE_ID}/files`).set("x-role", "viewer").expect(200);
    const upload = await request(app)
      .post(`/api/spaces/${SPACE_ID}/files`)
      .set("x-role", "viewer")
      .attach("file", Buffer.from("hello"), "notes.md")
      .expect(403);
    await request(app)
      .put(`/api/spaces/${SPACE_ID}/files/text`)
      .set("x-role", "viewer")
      .send({ path: "notes.md", content: "hi", baseSha256: null })
      .expect(403);
    await request(app).delete(`/api/spaces/${SPACE_ID}/files?path=notes.md`).set("x-role", "viewer").expect(403);
    await request(app).delete(`/api/spaces/${SPACE_ID}/files/changes/${CHANGE_ID}`).set("x-role", "viewer").expect(403);

    expect(upload.body.code).toBe("SPACE_CANNOT_CREATE_TASKS");
    expect(files.upload).not.toHaveBeenCalled();
    expect(files.saveText).not.toHaveBeenCalled();
    expect(files.remove).not.toHaveBeenCalled();
    expect(files.dismissChange).not.toHaveBeenCalled();
  });
});

describe("listing a Files space's artifacts", () => {
  const TASK_ID = "33333333-3333-4333-8333-333333333333";

  it("lists one task's artifacts when asked, and refuses a task that isn't an id", async () => {
    const { app, artifacts } = setup();
    artifacts.list.mockResolvedValue([]);

    await request(app).get(`/api/spaces/${SPACE_ID}/artifacts?taskId=${TASK_ID}`).set("x-role", "viewer").expect(200);
    await request(app).get(`/api/spaces/${SPACE_ID}/artifacts`).set("x-role", "viewer").expect(200);
    await request(app).get(`/api/spaces/${SPACE_ID}/artifacts?taskId=TO-1`).set("x-role", "viewer").expect(400);

    expect(artifacts.list.mock.calls).toEqual([[SPACE_ID, TASK_ID], [SPACE_ID, undefined]]);
  });
});
