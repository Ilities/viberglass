import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  resolvePullRequestDescription,
  resolvePullRequestTitle,
} from "./pullRequestContent";

describe("pullRequestContent", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-content-"));
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  test("uses and removes agent-generated PR title file", () => {
    const titlePath = path.join(repoDir, "PR_TITLE.md");
    fs.writeFileSync(titlePath, "  ## Improve login UX.  ");

    const title = resolvePullRequestTitle(repoDir, "ignored");

    expect(title).toBe("Improve login UX");
    expect(fs.existsSync(titlePath)).toBe(false);
  });

  test("builds fallback PR title when no generated file exists", () => {
    const title = resolvePullRequestTitle(
      repoDir,
      "BUG DESCRIPTION:\nFix blank page on dashboard load.",
    );

    expect(title).toBe("fix: Fix blank page on dashboard load");
  });

  test("uses and removes agent-generated PR description file", () => {
    const descriptionPath = path.join(repoDir, "PR_DESCRIPTION.md");
    fs.writeFileSync(descriptionPath, "## Summary\nAgent-authored description");

    const description = resolvePullRequestDescription({
      repoDir,
      task: "ignored",
      changedFiles: [],
      testsWereRequested: false,
    });

    expect(description).toBe("## Summary\nAgent-authored description");
    expect(fs.existsSync(descriptionPath)).toBe(false);
  });

  test("builds fallback PR description when no generated file exists", () => {
    const description = resolvePullRequestDescription({
      repoDir,
      task: "Fix the webhook retry loop.",
      changedFiles: ["src/webhook/retry.ts"],
      testsWereRequested: true,
    });

    expect(description).toContain("## Summary");
    expect(description).toContain("Fix the webhook retry loop.");
    expect(description).toContain("- `src/webhook/retry.ts`");
    expect(description).toContain("run relevant tests");
  });
});
