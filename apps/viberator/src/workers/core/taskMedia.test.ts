import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { localTaskMedia, taskMediaDir, withTaskMedia } from "./taskMedia";
import type { TicketMediaPayload } from "./types";

const logger = { warn: jest.fn() };

function media(overrides: Partial<TicketMediaPayload>): TicketMediaPayload {
  return {
    id: "m-1",
    kind: "screenshot",
    filename: "login error.png",
    mimeType: "image/png",
    size: 3,
    uploadedAt: "2026-10-21T10:00:00.000Z",
    storageUrl: "s3://bucket/m-1",
    ...overrides,
  };
}

describe("localTaskMedia", () => {
  let dir: string;
  beforeEach(() => {
    jest.clearAllMocks();
    dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "task-media-")), "task-media");
  });

  it("uses a mounted file where it is", async () => {
    const fetchFn = jest.fn();
    const local = await localTaskMedia([media({ mountPath: "/media/screenshots/m-1.png" })], dir, logger, fetchFn);
    expect(local).toEqual([{ kind: "screenshot", filename: "login error.png", mimeType: "image/png", path: "/media/screenshots/m-1.png" }]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("downloads media from their signed links into the media folder", async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const [local] = await localTaskMedia([media({ accessUrl: "https://s3.example.com/signed" })], dir, logger, fetchFn);
    expect(fetchFn.mock.calls[0][0]).toBe("https://s3.example.com/signed");
    expect(local.path).toBe(path.join(dir, "m-1-login_error.png"));
    expect([...fs.readFileSync(local.path)]).toEqual([1, 2, 3]);
  });

  it("leaves out what it can't fetch, and goes on with the rest", async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response("gone", { status: 403 }));
    const local = await localTaskMedia(
      [media({ accessUrl: "https://s3.example.com/expired" }), media({ id: "m-2", kind: "recording" }), media({ id: "m-3", mountPath: "/media/m-3.png" })],
      dir,
      logger,
      fetchFn,
    );
    expect(local.map((item) => item.path)).toEqual(["/media/m-3.png"]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});

describe("withTaskMedia", () => {
  it("lists the media after the prompt", () => {
    const prompt = withTaskMedia("Fix the login error.", [{ kind: "screenshot", filename: "error.png", mimeType: "image/png", path: "/work/task-media/m-1-error.png" }]);
    expect(prompt).toBe(
      "Fix the login error.\n\nAttached to the task, for you to open and look at:\n- screenshot, error.png (image/png): /work/task-media/m-1-error.png",
    );
  });

  it("leaves the prompt alone without media", () => {
    expect(withTaskMedia("Fix it.", [])).toBe("Fix it.");
    expect(withTaskMedia(undefined, [{ kind: "screenshot", filename: "a.png", mimeType: "image/png", path: "/a.png" }])).toBeUndefined();
  });
});

describe("taskMediaDir", () => {
  it("is beside the workspace, outside it", () => {
    expect(taskMediaDir("/tmp/viberator-work/task-1/repo")).toBe("/tmp/viberator-work/task-1/task-media");
  });
});
