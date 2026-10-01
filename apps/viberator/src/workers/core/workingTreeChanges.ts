import * as fs from "fs";
import * as path from "path";
import { simpleGit } from "simple-git";
import { ARTIFACT_FILES, VIBERGLASS_FILES } from "./turnArtifacts";

/** What the agent changed in the repository, new files included, leaving out the files Viberglass reads. */
export async function listCodeChanges(repoDir: string): Promise<string[]> {
  const status = await simpleGit({ baseDir: repoDir }).status();
  return status.files.map((file) => file.path).filter((filePath) => !VIBERGLASS_FILES.has(filePath));
}

/** Puts the research and plan files back as the repository has them, so they are never committed. */
export async function restoreArtifactFiles(repoDir: string): Promise<void> {
  const git = simpleGit({ baseDir: repoDir });
  for (const file of Object.values(ARTIFACT_FILES)) {
    const tracked = (await git.raw(["ls-files", "--", file])).trim().length > 0;
    if (tracked) await git.checkout(["HEAD", "--", file]);
    else fs.rmSync(path.join(repoDir, file), { force: true });
  }
}

/** Throws away the agent's changes to the code, for a turn that wasn't asked to write any. */
export async function discardCodeChanges(repoDir: string): Promise<void> {
  const git = simpleGit({ baseDir: repoDir });
  await git.reset(["--hard"]);
  // Not -x: files the worker put in .git/info/exclude (instructions) stay.
  await git.clean("f", ["-d"]);
}
