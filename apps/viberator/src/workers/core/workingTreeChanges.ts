import * as fs from "fs";
import * as path from "path";
import { simpleGit, type SimpleGit } from "simple-git";
import { ARTIFACT_FILES, VIBERGLASS_FILES } from "./turnArtifacts";

/** What the agent changed in the repository, new files included, leaving out the files Viberglass reads. */
export async function listCodeChanges(repoDir: string): Promise<string[]> {
  const status = await simpleGit({ baseDir: repoDir }).status();
  return status.files.map((file) => file.path).filter((filePath) => !VIBERGLASS_FILES.has(filePath));
}

/** The commit a turn starts from, which the plan and summary files go back to afterwards; undefined outside a repository. */
export async function turnStartCommit(repoDir: string): Promise<string | undefined> {
  try {
    return (await simpleGit({ baseDir: repoDir }).revparse(["HEAD"])).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Puts the plan and summary files back as the turn's start commit has them,
 * so they are never committed, whether the agent left them untracked, staged
 * them or committed them itself.
 */
export async function restoreArtifactFiles(repoDir: string, startCommit = "HEAD"): Promise<void> {
  const git = simpleGit({ baseDir: repoDir });
  for (const file of Object.values(ARTIFACT_FILES)) {
    if (await committedIn(git, startCommit, file)) {
      await git.raw(["checkout", startCommit, "--", file]);
    } else {
      await git.raw(["rm", "--cached", "--quiet", "--ignore-unmatch", "--", file]);
      fs.rmSync(path.join(repoDir, file), { force: true });
    }
  }
}

async function committedIn(git: SimpleGit, commit: string, file: string): Promise<boolean> {
  try {
    await git.raw(["cat-file", "-e", `${commit}:${file}`]);
    return true;
  } catch {
    return false;
  }
}

/** Throws away the agent's changes to the code, for a turn that wasn't asked to write any. */
export async function discardCodeChanges(repoDir: string): Promise<void> {
  const git = simpleGit({ baseDir: repoDir });
  await git.reset(["--hard"]);
  // Not -x: files the worker put in .git/info/exclude (instructions) stay.
  await git.clean("f", ["-d"]);
}
