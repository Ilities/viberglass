import * as fs from "fs";
import * as path from "path";

/** The documents a turn reads and writes, as files in the repository root. */
export const ARTIFACT_FILES = { plan: "PLAN.md", summary: "SUMMARY.md" } as const;

export type TurnArtifact = keyof typeof ARTIFACT_FILES;

export type TurnDocuments = Partial<Record<TurnArtifact, string>>;

/** What each file held before the agent ran: the current version, or null when the repository had no such file. */
export type ArtifactSnapshot = Record<TurnArtifact, string | null>;

const ARTIFACTS: TurnArtifact[] = ["plan", "summary"];

function read(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
}

/**
 * Writes the task's current documents into the repository, so the agent
 * revises them in place, and keeps them out of any commit.
 */
export function materializeArtifacts(repoDir: string, current: TurnDocuments): ArtifactSnapshot {
  const snapshot: ArtifactSnapshot = { plan: null, summary: null };
  for (const artifact of ARTIFACTS) {
    const filePath = path.join(repoDir, ARTIFACT_FILES[artifact]);
    const content = current[artifact];
    if (content?.trim()) fs.writeFileSync(filePath, content, "utf-8");
    snapshot[artifact] = read(filePath);
  }
  const exclude = path.join(repoDir, ".git", "info", "exclude");
  if (fs.existsSync(path.dirname(exclude))) {
    fs.appendFileSync(exclude, `\n${Object.values(ARTIFACT_FILES).map((file) => `/${file}`).join("\n")}\n`);
  }
  return snapshot;
}

/** The documents the agent wrote: each file it changed and left with something in it. */
export function collectArtifacts(repoDir: string, before: ArtifactSnapshot): TurnDocuments {
  const written: TurnDocuments = {};
  for (const artifact of ARTIFACTS) {
    const after = read(path.join(repoDir, ARTIFACT_FILES[artifact]));
    if (after !== null && after.trim() && after !== before[artifact]) written[artifact] = after;
  }
  return written;
}

/** The files Viberglass reads from the repository, which are never code changes. */
export const VIBERGLASS_FILES: ReadonlySet<string> = new Set([...Object.values(ARTIFACT_FILES), "PR_TITLE.md", "PR_DESCRIPTION.md"]);
