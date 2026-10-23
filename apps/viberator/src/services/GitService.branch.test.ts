import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger, transports } from "winston";
import GitService from "./GitService";

/**
 * A second build on a task continues the branch the first build pushed.
 * Exercised against a real bare repository, since the failure it prevents
 * (a non-fast-forward push rejection) only shows up in real git.
 */
describe("GitService.checkoutRemoteBranch", () => {
  const logger = createLogger({ transports: [new transports.Console({ silent: true })] });
  const gitService = new GitService(logger, { userName: "Test", userEmail: "test@example.com" });
  let root: string;
  let remote: string;
  const inheritedGitEnv: Record<string, string | undefined> = {};

  // simple-git refuses to run with editor/pager variables a developer's shell
  // may set; worker containers set none of them.
  beforeAll(() => {
    for (const key of Object.keys(process.env).filter((name) => name.startsWith("GIT_") || name === "EDITOR" || name === "VISUAL" || name === "PAGER")) {
      inheritedGitEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterAll(() => Object.assign(process.env, inheritedGitEnv));

  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@e" } }).trim();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "task-branch-"));
    remote = path.join(root, "remote.git");
    git(root, "init", "--bare", "--initial-branch=main", remote);

    const seed = path.join(root, "seed");
    git(root, "clone", remote, seed);
    fs.writeFileSync(path.join(seed, "a.txt"), "base\n");
    git(seed, "add", ".");
    git(seed, "commit", "-m", "base");
    git(seed, "push", "origin", "HEAD:main");
    git(seed, "checkout", "-b", "viberglass/task-1");
    fs.writeFileSync(path.join(seed, "a.txt"), "first build\n");
    git(seed, "commit", "-am", "build run 1");
    git(seed, "push", "origin", "viberglass/task-1");
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  async function cloneMain(): Promise<string> {
    const workDir = path.join(root, `work-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(workDir);
    await gitService.cloneRepository(remote, "main", workDir);
    return path.join(workDir, "repo");
  }

  it("checks out the task branch an earlier build pushed", async () => {
    const repoDir = await cloneMain();

    await expect(gitService.checkoutRemoteBranch(repoDir, "viberglass/task-1")).resolves.toBe(true);

    expect(git(repoDir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("viberglass/task-1");
    expect(fs.readFileSync(path.join(repoDir, "a.txt"), "utf8")).toBe("first build\n");
  });

  it("lets the next build push its commit on top without a rejection", async () => {
    const repoDir = await cloneMain();
    await gitService.checkoutRemoteBranch(repoDir, "viberglass/task-1");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "second build\n");
    await gitService.commitChanges(repoDir, "build run 2");

    await gitService.pushBranch(repoDir, "viberglass/task-1");

    expect(git(remote, "log", "--format=%s", "viberglass/task-1").split("\n")).toEqual([
      "build run 2",
      "build run 1",
      "base",
    ]);
  });

  it("leaves the base branch checked out when the task has no branch yet", async () => {
    const repoDir = await cloneMain();

    await expect(gitService.checkoutRemoteBranch(repoDir, "viberglass/task-2")).resolves.toBe(false);

    expect(git(repoDir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
  });

  it("does not mistake a branch that merely ends with the same name", async () => {
    const seed = path.join(root, "seed");
    git(seed, "push", "origin", "viberglass/task-1:refs/heads/other/viberglass/task-3");
    const repoDir = await cloneMain();

    await expect(gitService.checkoutRemoteBranch(repoDir, "viberglass/task-3")).resolves.toBe(false);
  });

  describe("checkoutForkBase", () => {
    it("starts a fork at the commit its original had, then pushes the fork's own branch from there", async () => {
      const seed = path.join(root, "seed");
      const forkedAt = git(seed, "rev-parse", "HEAD");
      fs.writeFileSync(path.join(seed, "a.txt"), "after the fork\n");
      git(seed, "commit", "-am", "build run 2");
      git(seed, "push", "origin", "viberglass/task-1");
      const repoDir = await cloneMain();

      await expect(gitService.checkoutForkBase(repoDir, { branch: "viberglass/task-1", commit: forkedAt })).resolves.toBe(true);
      expect(fs.readFileSync(path.join(repoDir, "a.txt"), "utf8")).toBe("first build\n");

      await gitService.createBranch(repoDir, "viberglass/task-1-claude-code");
      fs.writeFileSync(path.join(repoDir, "a.txt"), "fork build\n");
      await gitService.commitChanges(repoDir, "fork run 1");
      await gitService.pushBranch(repoDir, "viberglass/task-1-claude-code");
      expect(git(remote, "log", "--format=%s", "viberglass/task-1-claude-code").split("\n")).toEqual(["fork run 1", "build run 1", "base"]);
    });

    it("starts at the branch's head without a commit", async () => {
      const repoDir = await cloneMain();

      await gitService.checkoutForkBase(repoDir, { branch: "viberglass/task-1", commit: null });

      expect(fs.readFileSync(path.join(repoDir, "a.txt"), "utf8")).toBe("first build\n");
    });

    it("stays on the base branch when origin no longer has the branch", async () => {
      const repoDir = await cloneMain();

      await expect(gitService.checkoutForkBase(repoDir, { branch: "viberglass/gone", commit: null })).resolves.toBe(false);

      expect(git(repoDir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    });
  });
});
