import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { appDataCopyDir, localAppDataCopy, removeAppDataCopy, withAppDataCopy } from "./appDataCopy";

const logger = { warn: jest.fn() };
const copy = { accessUrl: "https://s3.example.com/signed", copiedAt: "2026-11-05T10:00:00.000Z", bytes: 3 };

describe("localAppDataCopy", () => {
  let dir: string;
  beforeEach(() => {
    jest.clearAllMocks();
    dir = appDataCopyDir(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "app-data-")), "repo"));
  });

  it("downloads the copy next to the repository, not inside it", async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));

    const local = await localAppDataCopy(copy, dir, logger, fetchFn);

    expect(fetchFn.mock.calls[0][0]).toBe(copy.accessUrl);
    expect(local).toEqual({ path: path.join(dir, "app.db"), copiedAt: copy.copiedAt });
    expect(path.basename(path.dirname(local!.path))).toBe("app-data");
    expect([...fs.readFileSync(local!.path)]).toEqual([1, 2, 3]);
    removeAppDataCopy(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("goes on without a copy it couldn't download", async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response("expired", { status: 403 }));

    await expect(localAppDataCopy(copy, dir, logger, fetchFn)).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalled();
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("does nothing when the turn has no copy", async () => {
    const fetchFn = jest.fn();
    await expect(localAppDataCopy(undefined, dir, logger, fetchFn)).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("withAppDataCopy", () => {
  it("tells the agent where the copy is and when it was taken", () => {
    const prompt = withAppDataCopy("How many laptops are there?", { path: "/work/app-data/app.db", copiedAt: copy.copiedAt });
    expect(prompt).toContain("How many laptops are there?\n\nA copy of the live app's SQLite database, as it was at 2026-11-05T10:00:00.000Z, is at /work/app-data/app.db.");
    expect(prompt).toContain("APP_DATABASE_PATH");
  });

  it("leaves the prompt alone without a copy", () => {
    expect(withAppDataCopy("Hi", null)).toBe("Hi");
  });
});
