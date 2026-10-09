import { Logger } from "winston";
import { simpleGit, SimpleGit } from "simple-git";
import * as path from "path";
import { gitAuthEnvironment, toRemoteUrl, type GitAuth } from "./gitAuth";
import { GitConfig } from "../types";

/**
 * simple-git blocks GIT_CONFIG_COUNT by default. Credentials are supplied through
 * it (see gitAuthEnvironment), so authenticated invocations
 * have to opt in. `http.<origin>.extraheader` is not separately block-listed, so
 * this flag alone is enough.
 */
const AUTHENTICATED_GIT_OPTIONS = {
  unsafe: { allowUnsafeConfigEnvCount: true },
} as const;

class GitService {
  private gitConfig: GitConfig;

  constructor(
    private logger: Logger,
    gitConfig?: GitConfig,
  ) {
    this.gitConfig = gitConfig || {
      userName: process.env.GIT_USER_NAME || "Vibes Viber",
      userEmail: process.env.GIT_USER_EMAIL || "viberator@viberglass.io",
    };
  }

  private async initializeGitConfig(repoDir: string): Promise<SimpleGit> {
    try {
      const git = simpleGit({ baseDir: repoDir });
      await git.addConfig("user.name", this.gitConfig.userName, false, "local");
      await git.addConfig(
        "user.email",
        this.gitConfig.userEmail,
        false,
        "local",
      );
      this.logger.debug("Git user identity configured", {
        userName: this.gitConfig.userName,
        userEmail: this.gitConfig.userEmail,
        repoDir,
      });
      return git;
    } catch (error) {
      this.logger.warn("Failed to configure git user identity", { error });
      return simpleGit({ baseDir: repoDir });
    }
  }

  /**
   * Environment for a single authenticated git invocation.
   *
   * Credentials are supplied per-process via `GIT_CONFIG_*` rather than embedded in
   * the remote URL, so nothing is written to `.git/config` — the agent runs with the
   * repository as its working directory and can read that file.
   */
  private buildGitEnvironment(
    repoUrl: string,
    auth?: GitAuth,
  ): NodeJS.ProcessEnv {
    const authEnv = gitAuthEnvironment(repoUrl, auth);

    if (Object.keys(authEnv).length === 0) {
      this.logger.warn(
        "No SCM credentials resolved for repository; git will run unauthenticated",
        { repoUrl },
      );
    }

    return {
      ...process.env,
      ...authEnv,
      GIT_TERMINAL_PROMPT: "0",
    };
  }

  /**
   * Auth for talking to origin. The remote URL stays credential-free; auth is
   * attached per invocation for the origin's host.
   */
  private async originEnvironment(git: SimpleGit, auth?: GitAuth): Promise<NodeJS.ProcessEnv> {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    const originUrl = origin?.refs.push || origin?.refs.fetch;

    if (!originUrl) {
      throw new Error("No 'origin' remote found in repository");
    }

    return this.buildGitEnvironment(originUrl, auth);
  }

  /**
   * Clone repository with automatic SCM authentication using simple-git
   */
  public async cloneRepository(
    repoUrl: string,
    branch: string,
    workDir: string,
    auth?: GitAuth,
  ): Promise<void> {
    try {
      this.logger.info("Cloning repository", { repoUrl, branch });

      const remoteUrl = toRemoteUrl(repoUrl);
      const env = this.buildGitEnvironment(repoUrl, auth);

      const git = simpleGit({ baseDir: workDir, ...AUTHENTICATED_GIT_OPTIONS });
      const repoPath = path.join(workDir, "repo");

      await git.env(env).clone(remoteUrl, repoPath, [
        "--branch",
        branch,
        "--single-branch",
      ]);

      this.logger.debug("Repository cloned successfully", { repoUrl, branch });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Git clone failed", { error: errorMessage });
      throw new Error(`Git clone failed: ${errorMessage}`);
    }
  }

  /**
   * Parse changed files from git diff
   */
  public async getChangedFiles(repoDir: string): Promise<string[]> {
    try {
      const git = simpleGit({ baseDir: repoDir });
      const result = await git.diff(["--name-only"]);
      return result.split("\n").filter((line) => line.trim().length > 0);
    } catch (error) {
      this.logger.warn("Could not get changed files", { error });
      return [];
    }
  }

  /**
   * The commit the working tree is currently at.
   *
   * Captured before the agent runs so the run manifest records the exact
   * repository state a run started from.
   *
   * Returns undefined rather than throwing — a missing SHA must not fail a
   * job, and an absent value is recorded honestly as absent.
   */
  public async getHeadSha(repoDir: string): Promise<string | undefined> {
    try {
      const git = simpleGit({ baseDir: repoDir });
      const sha = await git.revparse(["HEAD"]);
      return sha.trim() || undefined;
    } catch (error) {
      this.logger.warn("Could not resolve HEAD sha", { repoDir, error });
      return undefined;
    }
  }

  /**
   * Create a new branch using simple-git
   */
  public async createBranch(
    repoDir: string,
    branchName: string,
  ): Promise<void> {
    try {
      const git = simpleGit({ baseDir: repoDir });
      await git.checkoutLocalBranch(branchName);
      this.logger.info("Branch created", { branchName });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Failed to create branch", { error: errorMessage });
      throw new Error(`Failed to create branch: ${errorMessage}`);
    }
  }

  /**
   * Checks out `branchName` from origin when it exists there, so a run
   * continues the work an earlier run pushed. The clone is single-branch, so
   * the branch is fetched by an explicit refspec. Returns false, leaving the
   * working tree alone, when origin has no such branch.
   */
  public async checkoutRemoteBranch(
    repoDir: string,
    branchName: string,
    auth?: GitAuth,
  ): Promise<boolean> {
    const git = simpleGit({ baseDir: repoDir, ...AUTHENTICATED_GIT_OPTIONS });
    const env = await this.originEnvironment(git, auth);

    const heads = await git.env(env).listRemote(["--heads", "origin", branchName]);
    const exists = heads
      .split("\n")
      .some((line) => line.trim().endsWith(`refs/heads/${branchName}`));
    if (!exists) return false;

    await git.env(env).fetch("origin", `+refs/heads/${branchName}:refs/remotes/origin/${branchName}`);
    await git.checkout(["-b", branchName, `origin/${branchName}`]);
    this.logger.info("Continuing existing branch", { branchName });
    return true;
  }

  /**
   * Commit changes using simple-git
   */
  public async commitChanges(
    repoDir: string,
    message: string,
  ): Promise<string> {
    try {
      const git = await this.initializeGitConfig(repoDir);

      // Check if there are changes to commit
      const status = await git.status();
      if (status.files.length === 0) {
        this.logger.info("No changes to commit");
        const log = await git.log({ maxCount: 1 });
        return log.latest?.hash || "";
      }

      // Stage all changes
      await git.add(".");

      // Commit with message
      const commitMessage = `fix: ${message}\n\n🤖 Generated by Viberator`;
      await git.commit(commitMessage);

      // Get commit hash
      const log = await git.log({ maxCount: 1 });
      const commitHash = log.latest?.hash || "";

      this.logger.info("Changes committed", { commitHash });
      return commitHash;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Failed to commit changes", { error: errorMessage });
      throw new Error(`Failed to commit changes: ${errorMessage}`);
    }
  }

  /**
   * Push branch using simple-git
   */
  public async pushBranch(repoDir: string, branchName: string, auth?: GitAuth): Promise<void> {
    try {
      const git = simpleGit({ baseDir: repoDir, ...AUTHENTICATED_GIT_OPTIONS });
      const env = await this.originEnvironment(git, auth);

      await git.env(env).push("origin", branchName, ["--set-upstream"]);
      this.logger.info("Branch pushed", { branchName });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Failed to push branch", { error: errorMessage });
      throw new Error(`Failed to push branch: ${errorMessage}`);
    }
  }

}

export default GitService;
