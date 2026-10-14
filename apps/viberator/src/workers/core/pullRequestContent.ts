import * as fs from "fs";
import * as path from "path";

/** The ticket a run worked on, when it has one. */
export interface PullRequestTicket {
  title?: string;
  description?: string;
}

interface ResolvePullRequestDescriptionParams {
  repoDir: string;
  task: string;
  ticket?: PullRequestTicket;
  changedFiles: string[];
  testsWereRequested: boolean;
}

/**
 * Longest problem statement a fallback description quotes. The task is the
 * rendered prompt, and for a ticket run it carries the plan; a fallback
 * must never paste that into the PR.
 */
const MAX_PROBLEM_LENGTH = 2000;

export function resolvePullRequestTitle(
  repoDir: string,
  task: string,
  ticket?: PullRequestTicket,
): string {
  return (
    readAgentGeneratedPullRequestTitle(repoDir) ||
    buildPullRequestTitle(ticket?.title?.trim() || task)
  );
}

export function resolvePullRequestDescription(
  params: ResolvePullRequestDescriptionParams,
): string {
  return (
    readAgentGeneratedPullRequestDescription(params.repoDir) ||
    buildPullRequestDescription(
      describeProblem(params.task, params.ticket),
      params.changedFiles,
      params.testsWereRequested,
    )
  );
}

function readAgentGeneratedPullRequestTitle(repoDir: string): string | undefined {
  const prTitlePath = path.join(repoDir, "PR_TITLE.md");

  try {
    if (!fs.existsSync(prTitlePath)) {
      return undefined;
    }

    const title = fs.readFileSync(prTitlePath, "utf8").trim();
    fs.unlinkSync(prTitlePath);
    return title.length > 0 ? sanitizePullRequestTitle(title) : undefined;
  } catch {
    return undefined;
  }
}

function readAgentGeneratedPullRequestDescription(
  repoDir: string,
): string | undefined {
  const prDescriptionPath = path.join(repoDir, "PR_DESCRIPTION.md");

  try {
    if (!fs.existsSync(prDescriptionPath)) {
      return undefined;
    }

    const description = fs.readFileSync(prDescriptionPath, "utf8").trim();
    fs.unlinkSync(prDescriptionPath);
    return description.length > 0 ? description : undefined;
  } catch {
    return undefined;
  }
}

function buildPullRequestTitle(task: string): string {
  const lines = task
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const candidate =
    lines.find((line) => {
      const upper = line.toUpperCase();
      return ![
        "BUG DESCRIPTION:",
        "STEPS TO REPRODUCE:",
        "EXPECTED BEHAVIOR:",
        "ACTUAL BEHAVIOR:",
        "STACK TRACE:",
      ].includes(upper);
    }) || "Changes from Viberglass";

  // The task's own title, as people wrote it: a run can't tell a fix from a feature or docs.
  const baseTitle = sanitizePullRequestTitle(candidate);
  return baseTitle.length > 72 ? `${baseTitle.slice(0, 69).trimEnd()}...` : baseTitle;
}

function sanitizePullRequestTitle(input: string): string {
  return input
    .replace(/[#*_`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

interface ProblemStatement {
  summary: string;
  problem: string;
}

/** A ticket run describes its ticket; only a run without one falls back to the task. */
function describeProblem(task: string, ticket?: PullRequestTicket): ProblemStatement {
  const title = ticket?.title?.trim();
  if (title) {
    return { summary: title, problem: truncate(ticket?.description?.trim() ?? "") };
  }
  const summary =
    task.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ||
    "Changes from Viberglass";
  return { summary, problem: truncate(task.trim()) };
}

function truncate(text: string): string {
  return text.length > MAX_PROBLEM_LENGTH
    ? `${text.slice(0, MAX_PROBLEM_LENGTH).trimEnd()}\n\n…`
    : text;
}

function buildPullRequestDescription(
  { summary, problem }: ProblemStatement,
  changedFiles: string[],
  testsWereRequested: boolean,
): string {
  const filesSection =
    changedFiles.length > 0
      ? changedFiles.map((file) => `- \`${file}\``).join("\n")
      : "- The agent's run didn't report which files changed.";
  const testingSection = testsWereRequested ? "\n\n## Testing\nThe agent was asked to run the tests that cover the change." : "";
  const problemSection = problem ? `\n\n## Task\n${problem}` : "";

  return `## Summary
${summary}${problemSection}

## Files changed
${filesSection}${testingSection}`;
}

/** The pull request's body: its description signed by the worker, or a default when there's none. */
export function pullRequestBody(description?: string): string {
  return description ? `${description}\n\n---\nOpened by an agent in Viberglass.` : "Opened by an agent in Viberglass.";
}
