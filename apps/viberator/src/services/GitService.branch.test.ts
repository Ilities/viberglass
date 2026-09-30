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
    git(seed, "checkout", "-b", "viberator/task-1");
    fs.writeFileSync(path.join(seed, "a.txt"), "first build\n");
    git(seed, "commit", "-am", "build run 1");
    git(seed, "push", "origin", "viberator/task-1");
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

    await expect(gitService.checkoutRemoteBranch(repoDir, "viberator/task-1")).resolves.toBe(true);

    expect(git(repoDir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("viberator/task-1");
    expect(fs.readFileSync(path.join(repoDir, "a.txt"), "utf8")).toBe("first build\n");
  });

  it("lets the next build push its commit on top without a rejection", async () => {
    const repoDir = await cloneMain();
    await gitService.checkoutRemoteBranch(repoDir, "viberator/task-1");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "second build\n");
    await gitService.commitChanges(repoDir, "build run 2");

    await gitService.pushBranch(repoDir, "viberator/task-1");

    expect(git(remote, "log", "--format=%s", "viberator/task-1").split("\n")).toEqual([
      "fix: build run 2",
      "build run 1",
      "base",
    ]);
  });

  it("leaves the base branch checked out when the task has no branch yet", async () => {
    const repoDir = await cloneMain();

    await expect(gitService.checkoutRemoteBranch(repoDir, "viberator/task-2")).resolves.toBe(false);

    expect(git(repoDir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
  });

  it("does not mistake a branch that merely ends with the same name", async () => {
    const seed = path.join(root, "seed");
    git(seed, "push", "origin", "viberator/task-1:refs/heads/other/viberator/task-3");
    const repoDir = await cloneMain();

    await expect(gitService.checkoutRemoteBranch(repoDir, "viberator/task-3")).resolves.toBe(false);
  });
});
