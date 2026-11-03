import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as tar from "tar";
import { JOB_FAILURE_CODE } from "@viberglass/types";
import { JobFailureError } from "../core/JobFailureError";
import { buildRelease, type BuildReleaseDeps } from "./buildRelease";

const COMMIT = "c".repeat(40);

describe("buildRelease", () => {
  let root: string;
  let uploaded: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "build-release-"));
    uploaded = path.join(root, "uploaded.tar.gz");
    process.env.CALLBACK_TOKEN = "callback-secret";
    process.env.VIBERGLASS_SCM_TOKEN = "scm-secret";
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.CALLBACK_TOKEN;
    delete process.env.VIBERGLASS_SCM_TOKEN;
  });

  function deps(files: Record<string, string>, overrides: Partial<BuildReleaseDeps> = {}) {
    const client = {
      storageGrant: jest.fn().mockResolvedValue({ url: "https://storage.example/put", expiresAt: "2026-11-03T12:00:00Z" }),
      complete: jest.fn().mockResolvedValue(undefined),
    };
    const fetchCommit = jest.fn(async (_repository: string, _commit: string, workDir: string) => {
      const repoDir = path.join(workDir, "repo");
      fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
      fs.writeFileSync(path.join(repoDir, ".git", "HEAD"), COMMIT);
      for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(repoDir, name)), { recursive: true });
        fs.writeFileSync(path.join(repoDir, name), content);
      }
      return repoDir;
    });
    const upload = jest.fn(async (_url: string, file: string) => fs.copyFileSync(file, uploaded));
    const all: BuildReleaseDeps = {
      jobId: "build_1",
      tenantId: "api-server",
      repository: "https://github.com/acme/laptops",
      release: { releaseId: "release-1", commitSha: COMMIT },
      workDir: path.join(root, "work"),
      git: { fetchCommit },
      client,
      sendProgress: jest.fn().mockResolvedValue(undefined),
      upload,
      ...overrides,
    };
    return { all, client, upload, fetchCommit };
  }

  async function bundleEntries(): Promise<Map<string, { type: string; linkpath?: string }>> {
    const entries = new Map<string, { type: string; linkpath?: string }>();
    await tar.list({ file: uploaded, onReadEntry: (entry) => entries.set(entry.path, { type: entry.type, linkpath: entry.linkpath }) });
    return entries;
  }

  it("builds the commit and uploads it with its links and without git history", async () => {
    const build = "mkdir -p dist node_modules/.bin && echo built > dist/server.js && ln -s ../../dist/server.js node_modules/.bin/server && printf '%s%s' \"$CALLBACK_TOKEN\" \"$VIBERGLASS_SCM_TOKEN\" > dist/env.txt && echo done";
    const { all, client, fetchCommit } = deps({
      "viberglass.app.json": JSON.stringify({ build, start: "node dist/server.js", settings: [] }),
      "package.json": "{}",
    });

    await buildRelease(all);

    expect(fetchCommit).toHaveBeenCalledWith("https://github.com/acme/laptops", COMMIT, all.workDir, undefined);
    const entries = await bundleEntries();
    expect(entries.has("dist/server.js")).toBe(true);
    expect(entries.get("node_modules/.bin/server")).toEqual({ type: "SymbolicLink", linkpath: "../../dist/server.js" });
    expect([...entries.keys()].some((name) => name.startsWith(".git"))).toBe(false);

    const extracted = path.join(root, "extracted");
    fs.mkdirSync(extracted);
    await tar.extract({ file: uploaded, cwd: extracted });
    expect(fs.readFileSync(path.join(extracted, "dist/env.txt"), "utf8")).toBe("");

    expect(client.complete).toHaveBeenCalledWith("build_1", "api-server", {
      outcome: "ready",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      bundleBytes: fs.statSync(uploaded).size,
      nodeVersion: process.version,
      buildLog: "done\n",
    });
  });

  it("reports a missing manifest as a failed build", async () => {
    const { all, client, upload } = deps({ "package.json": "{}" });

    const failure = await buildRelease(all).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(JobFailureError);
    expect(failure).toMatchObject({ code: JOB_FAILURE_CODE.APP_BUILD_FAILED });
    expect(client.complete).toHaveBeenCalledWith("build_1", "api-server", { outcome: "failed", reason: "The app has no viberglass.app.json", buildLog: "" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports a failing build command with its output", async () => {
    const { all, client } = deps({
      "viberglass.app.json": JSON.stringify({ build: "echo compiling; echo broken >&2; exit 3", start: "node server.js" }),
    });

    await expect(buildRelease(all)).rejects.toMatchObject({ code: JOB_FAILURE_CODE.APP_BUILD_FAILED });

    expect(client.complete).toHaveBeenCalledWith("build_1", "api-server", {
      outcome: "failed",
      reason: "The build command exited with code 3",
      buildLog: expect.stringContaining("broken"),
    });
    expect(client.storageGrant).not.toHaveBeenCalled();
  });

  it("refuses a manifest without a start command", async () => {
    const { all, client } = deps({ "viberglass.app.json": JSON.stringify({ build: "true" }) });

    await expect(buildRelease(all)).rejects.toBeInstanceOf(JobFailureError);
    expect(client.complete).toHaveBeenCalledWith("build_1", "api-server", expect.objectContaining({ reason: 'viberglass.app.json needs a "start" command' }));
  });
});
