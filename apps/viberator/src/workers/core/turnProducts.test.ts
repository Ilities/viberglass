import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { simpleGit } from "simple-git";
import { collectArtifacts, materializeArtifacts } from "./turnArtifacts";
import { discardCodeChanges, listCodeChanges, restoreArtifactFiles, turnStartCommit } from "./workingTreeChanges";

/** A repository with one commit, as the worker clones it. */
async function repository(files: Record<string, string>): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turn-products-"));
  const git = simpleGit({ baseDir: dir });
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  await git.add(".");
  await git.commit("initial");
  return dir;
}

const write = (dir: string, name: string, content: string) => fs.writeFileSync(path.join(dir, name), content);

describe("what a turn produced", () => {
  it("finds the documents the agent wrote or revised, not the ones it left alone", async () => {
    const dir = await repository({ "app.js": "console.log(1)\n" });
    const snapshot = materializeArtifacts(dir, { plan: "# Plan v1\n", summary: undefined });
    expect(fs.readFileSync(path.join(dir, "PLAN.md"), "utf-8")).toBe("# Plan v1\n");

    write(dir, "SUMMARY.md", "# Summary v1\n");
    expect(collectArtifacts(dir, snapshot)).toEqual({ summary: "# Summary v1\n" });

    write(dir, "PLAN.md", "# Plan v2\n");
    expect(collectArtifacts(dir, snapshot)).toEqual({ plan: "# Plan v2\n", summary: "# Summary v1\n" });
  });

  it("doesn't count an emptied document as a version", async () => {
    const dir = await repository({ "app.js": "1\n" });
    const snapshot = materializeArtifacts(dir, { plan: "# Plan\n" });
    write(dir, "PLAN.md", "  \n");

    expect(collectArtifacts(dir, snapshot)).toEqual({});
  });

  it("never counts the documents as code, even where the repository tracks them", async () => {
    const dir = await repository({ "app.js": "1\n", "PLAN.md": "the repo's own plan\n" });
    materializeArtifacts(dir, { plan: "# Our plan\n", summary: "# Summary\n" });
    write(dir, "PLAN.md", "# Our plan, revised\n");

    await restoreArtifactFiles(dir);

    expect(await listCodeChanges(dir)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "PLAN.md"), "utf-8")).toBe("the repo's own plan\n");
    expect(fs.existsSync(path.join(dir, "SUMMARY.md"))).toBe(false);
  });

  it("keeps the plan and takes it out of the index when the agent force-staged it", async () => {
    const dir = await repository({ "app.js": "1\n" });
    const start = await turnStartCommit(dir);
    const snapshot = materializeArtifacts(dir, {});
    write(dir, "PLAN.md", "# The agent's plan\n");
    await simpleGit({ baseDir: dir }).raw(["add", "-f", "--", "PLAN.md"]);

    expect(collectArtifacts(dir, snapshot)).toEqual({ plan: "# The agent's plan\n" });
    await restoreArtifactFiles(dir, start);

    expect(await listCodeChanges(dir)).toEqual([]);
    expect((await simpleGit({ baseDir: dir }).status()).files).toEqual([]);
    expect(fs.existsSync(path.join(dir, "PLAN.md"))).toBe(false);
  });

  it("takes a plan the agent committed itself back out, so the next commit removes it", async () => {
    const dir = await repository({ "app.js": "1\n" });
    const start = await turnStartCommit(dir);
    materializeArtifacts(dir, {});
    write(dir, "PLAN.md", "# Committed plan\n");
    write(dir, "app.js", "2\n");
    const git = simpleGit({ baseDir: dir });
    await git.raw(["add", "-f", "--", "PLAN.md", "app.js"]);
    await git.commit("agent's own commit");

    await restoreArtifactFiles(dir, start);
    await git.commit("viberglass commit", ["--allow-empty"]);

    expect(await git.raw(["ls-tree", "--name-only", "HEAD"])).toBe("app.js\n");
  });

  it("puts back the repository's own plan when the agent committed a revision of it", async () => {
    const dir = await repository({ "app.js": "1\n", "PLAN.md": "the repo's own plan\n" });
    const start = await turnStartCommit(dir);
    write(dir, "PLAN.md", "# Revised\n");
    const git = simpleGit({ baseDir: dir });
    await git.add(["PLAN.md"]);
    await git.commit("agent's own commit");

    await restoreArtifactFiles(dir, start);

    expect(fs.readFileSync(path.join(dir, "PLAN.md"), "utf-8")).toBe("the repo's own plan\n");
    expect(await listCodeChanges(dir)).toEqual([]);
  });

  it("lists changed and new files as code, but not the pull request notes the agent leaves", async () => {
    const dir = await repository({ "app.js": "1\n" });
    write(dir, "app.js", "2\n");
    write(dir, "theme.css", "body {}\n");
    write(dir, "PR_TITLE.md", "Add dark mode\n");

    expect((await listCodeChanges(dir)).sort()).toEqual(["app.js", "theme.css"]);
  });

  it("throws code changes away, keeping files the worker excluded", async () => {
    const dir = await repository({ "app.js": "1\n" });
    fs.appendFileSync(path.join(dir, ".git", "info", "exclude"), "\n/AGENTS.md\n");
    write(dir, "AGENTS.md", "instructions\n");
    write(dir, "app.js", "2\n");
    fs.mkdirSync(path.join(dir, "src"));
    write(dir, "src/new.js", "new\n");

    await discardCodeChanges(dir);

    expect(await listCodeChanges(dir)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "app.js"), "utf-8")).toBe("1\n");
    expect(fs.existsSync(path.join(dir, "src"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "AGENTS.md"))).toBe(true);
  });
});
