import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { keptWorkFiles, keptWorkNote } from "./keptWork";

/** A task branch off main whose last commit is a stopped run's kept work. */
function branchWithKeptWork(): { dir: string; kept: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kept-work-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=E2E", "-c", "user.email=e2e@example.com", ...args], { cwd: dir, stdio: "pipe" }).toString().trim();
  git("init", "--initial-branch=main");
  fs.writeFileSync(path.join(dir, "app.js"), "one\n");
  git("add", ".");
  git("commit", "-m", "Initial");
  git("checkout", "-b", "viberglass/t-1");
  fs.writeFileSync(path.join(dir, "app.js"), "one\ntwo\n");
  fs.writeFileSync(path.join(dir, "check.ts"), "export {}\n");
  git("add", ".");
  git("commit", "-m", "Work in progress: the run was stopped partway");
  return { dir, kept: git("rev-parse", "HEAD") };
}

describe("kept work on the task's branch", () => {
  it("tells the agent which files the kept commit changed", async () => {
    const { dir, kept } = branchWithKeptWork();

    const note = await keptWorkNote(dir, kept);

    expect(note).toContain(`commit ${kept.slice(0, 12)}`);
    expect(note).toContain("app.js");
    expect(note).toContain("check.ts");
  });

  it("lists the files the branch changes from its base, for the pull request", async () => {
    const { dir, kept } = branchWithKeptWork();

    expect((await keptWorkFiles(dir, kept, "main"))?.sort()).toEqual(["app.js", "check.ts"]);
  });

  it("finds nothing when the kept commit isn't on the branch any more", async () => {
    const { dir, kept } = branchWithKeptWork();
    execFileSync("git", ["reset", "--hard", "main"], { cwd: dir });

    expect(await keptWorkNote(dir, kept)).toBeNull();
    expect(await keptWorkFiles(dir, kept, "main")).toBeNull();
  });

  it("finds nothing for a commit the repository doesn't have", async () => {
    const { dir } = branchWithKeptWork();

    expect(await keptWorkFiles(dir, "0123456789abcdef0123456789abcdef01234567", "main")).toBeNull();
  });
});
