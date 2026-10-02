import { execFile } from "child_process";
import { promisify } from "util";

const run = promisify(execFile);

async function git(repoDir: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: repoDir, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

/** Commit subjects are people's words; inside a tag they mustn't close it. */
const escape = (text: string) => text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * What people pushed to the task's branch since `since` (the agent's last
 * commit, else the base branch), for the agent to read first: someone who
 * took the work over handed it back, or a reviewer pushed a fix. Null when
 * nobody did, or the history can't be compared.
 */
export async function peoplesChanges(repoDir: string, since: string): Promise<string | null> {
  try {
    const commits = await git(repoDir, ["log", "--format=%h %an: %s", `${since}..HEAD`]);
    if (!commits) return null;
    const files = await git(repoDir, ["diff", "--stat", `${since}..HEAD`]);
    return [
      "<pushed-by-people>",
      "People pushed these commits to the task's branch since your last build. Your working copy has them; read what they changed before you go on.",
      escape(commits),
      "",
      escape(files),
      "</pushed-by-people>",
    ].join("\n");
  } catch {
    return null;
  }
}
