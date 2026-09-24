export interface GitHubRepositoryRef {
  owner: string;
  repo: string;
}

const NAME = "[A-Za-z0-9_.-]+";
const PATTERNS = [
  // owner/repo
  new RegExp(`^(${NAME})/(${NAME})$`),
  // https://github.com/owner/repo, github.com/owner/repo, with optional .git, path or query
  new RegExp(`^(?:https?://)?(?:www\\.)?github\\.com/(${NAME})/(${NAME})(?:[/?#].*)?$`, "i"),
  // git@github.com:owner/repo.git
  new RegExp(`^git@github\\.com:(${NAME})/(${NAME})$`, "i"),
];

/** Reads `owner/repo` or a GitHub URL (web, clone or SSH); null when it isn't one. */
export function parseGitHubRepository(input: string): GitHubRepositoryRef | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  for (const pattern of PATTERNS) {
    const match = pattern.exec(trimmed);
    if (!match) continue;
    const repo = match[2].replace(/\.git$/i, "");
    if (!repo || repo === "." || repo === "..") return null;
    return { owner: match[1], repo };
  }
  return null;
}
