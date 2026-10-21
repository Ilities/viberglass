import express from "express";
import request from "supertest";
import { registerTaskDiscussionRoutes } from "../../../../api/routes/tickets/discussionRoutes";

const TASK = "11111111-1111-4111-8111-111111111111";

function app() {
  const turns = {
    ask: jest.fn().mockResolvedValue({ session: { id: "s-1" }, currentTurn: { id: "turn-1" }, job: { id: "job-1", status: "pending" }, messageId: "m-1" }),
  };
  const discussion = { post: jest.fn().mockResolvedValue([]), list: jest.fn().mockResolvedValue([]) };
  const uploads = {
    uploadFile: jest.fn(async (file: Express.Multer.File, _kind: string) => ({
      id: `media-${file.originalname}`,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `s3://bucket/${file.originalname}`,
      storageUrl: `s3://bucket/${file.originalname}`,
      uploadedAt: "2026-10-21T10:00:00.000Z",
    })),
    deleteFileByStorageUrl: jest.fn().mockResolvedValue(undefined),
  };
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    const at = new Date();
    req.authContext = {
      user: { id: "u-1", email: "maria@example.com", name: "Maria", avatarUrl: null, role: "member", createdAt: at, updatedAt: at, deactivatedAt: null },
      session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
      roles: ["member"],
      permissions: [],
    };
    next();
  });
  const router = express.Router();
  registerTaskDiscussionRoutes(router, { discussion, timeline: { list: jest.fn() }, turns, mentions: { markDone: jest.fn() }, uploads });
  server.use("/api/tasks", router);
  server.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
  return { server, turns, discussion, uploads };
}

describe("POST /api/tasks/:id/messages with the parts of a build", () => {
  it("asks for a build of the parts named", async () => {
    const { server, turns } = app();

    const response = await request(server).post(`/api/tasks/${TASK}/messages`).send({ body: "", action: "code", parts: { first: 2, last: 2 } });

    expect(response.status).toBe(201);
    expect(turns.ask).toHaveBeenCalledWith(TASK, "u-1", { message: "", action: "code", agentId: undefined, parts: { first: 2, last: 2 } });
  });

  it.each([
    ["a range that runs backwards", { action: "code", parts: { first: 3, last: 2 } }],
    ["a part numbered 0", { action: "code", parts: { first: 0, last: null } }],
    ["a range without its end", { action: "code", parts: { first: 2 } }],
    ["parts on an ask that isn't a build", { action: "plan", parts: { first: 1, last: 1 } }],
  ])("refuses %s", async (_label, body) => {
    const { server, turns } = app();

    const response = await request(server).post(`/api/tasks/${TASK}/messages`).send({ body: "", ...body });

    expect(response.status).toBe(400);
    expect(turns.ask).not.toHaveBeenCalled();
  });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("POST /api/tasks/:id/messages with images", () => {
  it("stores the images and posts them with the message", async () => {
    const { server, discussion, uploads } = app();

    const response = await request(server)
      .post(`/api/tasks/${TASK}/messages`)
      .field("body", "This is what I see")
      .attach("images", PNG, { filename: "one.png", contentType: "image/png" })
      .attach("images", PNG, { filename: "two.png", contentType: "image/png" });

    expect(response.status).toBe(201);
    expect(uploads.uploadFile).toHaveBeenCalledTimes(2);
    expect(uploads.uploadFile.mock.calls[0][1]).toBe("image");
    expect(discussion.post).toHaveBeenCalledWith(TASK, "u-1", "This is what I see", [
      expect.objectContaining({ id: "media-one.png" }),
      expect.objectContaining({ id: "media-two.png" }),
    ]);
  });

  it("asks the agent with them, reading a build's parts from the form", async () => {
    const { server, turns } = app();

    await request(server)
      .post(`/api/tasks/${TASK}/messages`)
      .field("body", "Match this")
      .field("action", "code")
      .field("parts", JSON.stringify({ first: 1, last: 1 }))
      .field("add", "true")
      .attach("images", PNG, { filename: "mock.png", contentType: "image/png" });

    expect(turns.ask).toHaveBeenCalledWith(TASK, "u-1", {
      message: "Match this",
      action: "code",
      agentId: undefined,
      parts: { first: 1, last: 1 },
      add: true,
      images: [expect.objectContaining({ id: "media-mock.png" })],
    });
  });

  it("refuses files that aren't images, storing nothing", async () => {
    const { server, uploads } = app();

    const response = await request(server)
      .post(`/api/tasks/${TASK}/messages`)
      .field("body", "Here")
      .attach("images", Buffer.from("%PDF"), { filename: "spec.pdf", contentType: "application/pdf" });

    expect(response.status).toBe(400);
    expect(uploads.uploadFile).not.toHaveBeenCalled();
  });

  it("refuses more than four images", async () => {
    const { server } = app();
    let sent = request(server).post(`/api/tasks/${TASK}/messages`).field("body", "Many");
    for (const name of ["1", "2", "3", "4", "5"]) sent = sent.attach("images", PNG, { filename: `${name}.png`, contentType: "image/png" });

    const response = await sent;

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Attach up to 4 images.");
  });

  it("removes the stored images when the message can't be posted", async () => {
    const { server, discussion, uploads } = app();
    discussion.post.mockRejectedValue(new Error("Write a message"));

    const response = await request(server)
      .post(`/api/tasks/${TASK}/messages`)
      .attach("images", PNG, { filename: "lost.png", contentType: "image/png" });

    expect(response.status).toBe(500);
    expect(uploads.deleteFileByStorageUrl).toHaveBeenCalledWith("s3://bucket/lost.png");
  });
});
