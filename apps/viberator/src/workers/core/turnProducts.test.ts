import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { simpleGit } from "simple-git";
import { collectArtifacts, materializeArtifacts } from "./turnArtifacts";
import { discardCodeChanges, listCodeChanges, restoreArtifactFiles } from "./workingTreeChanges";

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
    const snapshot = materializeArtifacts(dir, { research: "# Research v1\n", plan: undefined });
    expect(fs.readFileSync(path.join(dir, "RESEARCH.md"), "utf-8")).toBe("# Research v1\n");

    write(dir, "PLAN.md", "# Plan v1\n");
    expect(collectArtifacts(dir, snapshot)).toEqual({ plan: "# Plan v1\n" });

    write(dir, "RESEARCH.md", "# Research v2\n");
    expect(collectArtifacts(dir, snapshot)).toEqual({ research: "# Research v2\n", plan: "# Plan v1\n" });
  });

  it("doesn't count an emptied document as a version", async () => {
    const dir = await repository({ "app.js": "1\n" });
    const snapshot = materializeArtifacts(dir, { research: "# Research\n" });
    write(dir, "RESEARCH.md", "  \n");

    expect(collectArtifacts(dir, snapshot)).toEqual({});
  });

  it("never counts the documents as code, even where the repository tracks them", async () => {
    const dir = await repository({ "app.js": "1\n", "PLAN.md": "the repo's own plan\n" });
    materializeArtifacts(dir, { research: "# Research\n", plan: "# Our plan\n" });
    write(dir, "PLAN.md", "# Our plan, revised\n");

    await restoreArtifactFiles(dir);

    expect(await listCodeChanges(dir)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "PLAN.md"), "utf-8")).toBe("the repo's own plan\n");
    expect(fs.existsSync(path.join(dir, "RESEARCH.md"))).toBe(false);
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
