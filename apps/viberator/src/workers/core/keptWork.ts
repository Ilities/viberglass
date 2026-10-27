import { execFile } from "child_process";
import { promisify } from "util";
import { VIBERGLASS_FILES } from "./turnArtifacts";

const run = promisify(execFile);

async function git(repoDir: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: repoDir, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

/** False too when the commit is gone: someone may have reset the branch since. */
async function onBranch(repoDir: string, commit: string): Promise<boolean> {
  try {
    await git(repoDir, ["merge-base", "--is-ancestor", commit, "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

const escape = (text: string) => text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Tells the agent that the branch it's on carries an earlier run's unfinished
 * work, which it would otherwise take for finished. Null when the commit
 * isn't on the checked-out branch.
 */
export async function keptWorkNote(repoDir: string, commit: string): Promise<string | null> {
  if (!(await onBranch(repoDir, commit))) return null;
  try {
    const files = await git(repoDir, ["show", "--stat", "--format=", commit]);
    return [
      "<kept-work>",
      `An earlier run on this task stopped before it finished. What it had changed was kept as commit ${commit.slice(0, 12)} on the task's branch, and your working copy has it:`,
      escape(files),
      "It may be incomplete or broken. Check it against the task before you build on it.",
      "</kept-work>",
    ].join("\n");
  } catch {
    return null;
  }
}

/** The files the task's branch changes from `base`, when it carries the kept commit; null when it doesn't. */
export async function keptWorkFiles(repoDir: string, commit: string, base: string): Promise<string[] | null> {
  if (!(await onBranch(repoDir, commit))) return null;
  try {
    const names = await git(repoDir, ["diff", "--name-only", `${base}...HEAD`]);
    return names.split("\n").filter((name) => name && !VIBERGLASS_FILES.has(name));
  } catch {
    return null;
  }
}
