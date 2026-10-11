import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { keepPartialWork, type PartialWorkRun } from "./keepPartialWork";
import { materializeArtifacts } from "./turnArtifacts";

function repo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "partial-work-"));
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=E2E", "-c", "user.email=e2e@example.com", ...args], { cwd: dir });
  git("init", "--initial-branch=main");
  fs.writeFileSync(path.join(dir, "app.js"), "one\n");
  git("add", ".");
  git("commit", "-m", "Initial");
  return dir;
}

function run(allowCode: boolean): PartialWorkRun & { sent: jest.Mock; commits: jest.Mock } {
  const sent = jest.fn().mockResolvedValue(undefined);
  const commits = jest.fn().mockResolvedValue("wip123");
  return {
    jobId: "job-1",
    tenantId: "tenant",
    allowCode,
    git: { createBranch: jest.fn().mockResolvedValue(undefined), commitChanges: commits, pushBranch: jest.fn().mockResolvedValue(undefined) },
    callbacks: { sendPartialResult: sent },
    logger: { info: jest.fn() },
    sent,
    commits,
  };
}

describe("keepPartialWork", () => {
  it("sends the documents a stopped turn had written", async () => {
    const dir = repo();
    const snapshot = materializeArtifacts(dir, { plan: "# Plan v1" });
    fs.writeFileSync(path.join(dir, "PLAN.md"), "# Plan, half done");
    const stopped = run(false);

    await keepPartialWork(stopped, { repoDir: dir, snapshot, taskBranch: undefined });

    expect(stopped.sent).toHaveBeenCalledWith("job-1", "tenant", { documents: { plan: "# Plan, half done" }, commitHash: undefined, branch: undefined });
    expect(stopped.commits).not.toHaveBeenCalled();
  });

  it("commits a stopped build's code to the task's branch, starting it if it's new", async () => {
    const dir = repo();
    const snapshot = materializeArtifacts(dir, {});
    fs.writeFileSync(path.join(dir, "app.js"), "one\ntwo\n");
    const stopped = run(true);

    await keepPartialWork(stopped, { repoDir: dir, snapshot, taskBranch: { name: "viberglass/t-1", continued: false } });

    expect(stopped.git.createBranch).toHaveBeenCalledWith(dir, "viberglass/t-1");
    expect(stopped.git.pushBranch).toHaveBeenCalledWith(dir, "viberglass/t-1", undefined);
    expect(stopped.sent).toHaveBeenCalledWith("job-1", "tenant", { documents: {}, commitHash: "wip123", branch: "viberglass/t-1" });
  });

  it("sends nothing when the turn hadn't done anything yet", async () => {
    const dir = repo();
    const stopped = run(true);
    await keepPartialWork(stopped, { repoDir: dir, snapshot: materializeArtifacts(dir, {}), taskBranch: { name: "b", continued: true } });
    expect(stopped.sent).not.toHaveBeenCalled();
  });
});
