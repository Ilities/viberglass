import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger, transports } from "winston";
import GitService from "./GitService";

/** A release builds the exact commit it was asked for, even after the branch moved on. */
describe("GitService.fetchCommit", () => {
  const logger = createLogger({ transports: [new transports.Console({ silent: true })] });
  const gitService = new GitService(logger, { userName: "Test", userEmail: "test@example.com" });
  let root: string;
  let remote: string;
  const inheritedGitEnv: Record<string, string | undefined> = {};

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
    root = fs.mkdtempSync(path.join(os.tmpdir(), "fetch-commit-"));
    remote = path.join(root, "remote.git");
    git(root, "init", "--bare", "--initial-branch=main", remote);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("checks out an older commit of the branch", async () => {
    const seed = path.join(root, "seed");
    git(root, "clone", remote, seed);
    fs.writeFileSync(path.join(seed, "a.txt"), "first\n");
    git(seed, "add", ".");
    git(seed, "commit", "-m", "first");
    const first = git(seed, "rev-parse", "HEAD");
    fs.writeFileSync(path.join(seed, "a.txt"), "second\n");
    git(seed, "commit", "-am", "second");
    git(seed, "push", "origin", "HEAD:main");

    const workDir = path.join(root, "work");
    fs.mkdirSync(workDir);
    const repoDir = await gitService.fetchCommit(`file://${remote}`, first, workDir);

    expect(fs.readFileSync(path.join(repoDir, "a.txt"), "utf8")).toBe("first\n");
    expect(git(repoDir, "rev-parse", "HEAD")).toBe(first);
  });

  it("fails for a commit the repository doesn't have", async () => {
    const workDir = path.join(root, "work");
    fs.mkdirSync(workDir);
    await expect(gitService.fetchCommit(`file://${remote}`, "a".repeat(40), workDir)).rejects.toThrow("Git fetch failed");
  });
});
