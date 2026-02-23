import * as fs from "fs";
import * as path from "path";

interface ResolvePullRequestDescriptionParams {
  repoDir: string;
  task: string;
  changedFiles: string[];
  testsWereRequested: boolean;
}

export function resolvePullRequestTitle(repoDir: string, task: string): string {
  return readAgentGeneratedPullRequestTitle(repoDir) || buildPullRequestTitle(task);
}

export function resolvePullRequestDescription(
  params: ResolvePullRequestDescriptionParams,
): string {
  return (
    readAgentGeneratedPullRequestDescription(params.repoDir) ||
    buildPullRequestDescription(
      params.task,
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
    }) || "automated bug fix";

  const normalized = sanitizePullRequestTitle(candidate);
  const hasConventionalPrefix = /^[a-z]+(\([^)]+\))?!?:/i.test(normalized);
  const baseTitle = hasConventionalPrefix ? normalized : `fix: ${normalized}`;

  return baseTitle.length > 72 ? `${baseTitle.slice(0, 69).trimEnd()}...` : baseTitle;
}

function sanitizePullRequestTitle(input: string): string {
  return input
    .replace(/[#*_`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

function buildPullRequestDescription(
  task: string,
  changedFiles: string[],
  testsWereRequested: boolean,
): string {
  const summary =
    task.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ||
    "Automated bug fix";

  const filesSection =
    changedFiles.length > 0
      ? changedFiles.map((file) => `- \`${file}\``).join("\n")
      : "- No file-level diff information was captured by the agent runtime.";

  const testingText = testsWereRequested
    ? "- The agent was instructed to run relevant tests as part of the fix."
    : "- Fix was verified manually by the agent as requested for this job.";

  return `## Summary
${summary}

## Problem
${task.trim()}

## Solution
- Implemented a focused fix based on the reported bug context.

## Changes Made
${filesSection}

## Testing
${testingText}`;
}
