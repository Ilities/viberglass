import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { peoplesChanges } from "./peoplesChanges";

function repoWithCommits(): { dir: string; agentCommit: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peoples-changes-"));
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Dev", "-c", "user.email=dev@example.com", ...args], { cwd: dir }).toString().trim();
  git("init", "--initial-branch=main");
  fs.writeFileSync(path.join(dir, "a.js"), "one\n");
  git("add", ".");
  git("commit", "-m", "The agent's build");
  const agentCommit = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(dir, "a.js"), "one\ntwo\n");
  git("commit", "-am", "Fix the <header> by hand");
  return { dir, agentCommit };
}

describe("peoplesChanges", () => {
  it("lists what people pushed after the agent's last commit, with their words kept inside the tag", async () => {
    const { dir, agentCommit } = repoWithCommits();
    const changes = await peoplesChanges(dir, agentCommit);
    expect(changes).toMatch(/^<pushed-by-people>\n/);
    expect(changes).toMatch(/[0-9a-f]{7} Dev: Fix the &lt;header&gt; by hand/);
    expect(changes).toContain("a.js | 1 +");
  });

  it("says nothing when nobody pushed, or the commit isn't in the history", async () => {
    const { dir } = repoWithCommits();
    expect(await peoplesChanges(dir, "HEAD")).toBeNull();
    expect(await peoplesChanges(dir, "0000000000000000000000000000000000000000")).toBeNull();
  });
});
