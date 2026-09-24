import { isObjectRecord, type RepositoryAccess } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../errors/SetupServiceError";
import type { GitHubRepositoryRef } from "./gitHubRepository";

const logger = createChildLogger({ service: "GitHubRepositoryChecker" });
const CHECK_TIMEOUT_MS = 10_000;
const WRITE_ACCESS_HINT =
  "Give it write access: for a fine-grained token, set Contents and Pull requests to Read and write; for a classic token, add the repo scope.";

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "headers" | "json">>;

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Checks, with one GitHub API request, that a token can read a repository and
 * push to it (the agent pushes a branch and opens a pull request).
 *
 * GitHub reports a classic token's scopes but offers no way to list a
 * fine-grained token's permissions, so for those `permissions.push` on the
 * repository is the signal; a missing "Pull requests" permission only shows
 * when the first pull request is opened.
 */
export class GitHubRepositoryChecker {
  private readonly apiBaseUrl: string;

  constructor(
    private readonly fetchFn: Fetch = fetch,
    // GitHub Enterprise, or a stub in the e2e suite.
    apiBaseUrl: string = process.env.GITHUB_API_URL || "https://api.github.com",
  ) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async check(ref: GitHubRepositoryRef, token: string): Promise<RepositoryAccess> {
    const name = `${ref.owner}/${ref.repo}`;
    let response: Awaited<ReturnType<Fetch>>;
    try {
      response = await this.fetchFn(`${this.apiBaseUrl}/repos/${name}`, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "Viberglass",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
    } catch (error) {
      logger.warn("GitHub repository check could not reach GitHub", {
        repository: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.GITHUB_UNREACHABLE,
        "Couldn't reach GitHub from this server. Check that the server can make outgoing HTTPS requests, then try again.",
      );
    }

    const body: unknown = await response.json().catch(() => null);
    const record = isObjectRecord(body) ? body : {};
    if (response.status !== 200) {
      throw this.toError(name, response.status, response.headers, readString(record, "message"));
    }
    return this.toAccess(ref, name, record, response.headers);
  }

  private toAccess(
    ref: GitHubRepositoryRef,
    name: string,
    repository: Record<string, unknown>,
    headers: Headers,
  ): RepositoryAccess {
    const permissions = isObjectRecord(repository.permissions) ? repository.permissions : {};
    // Only classic tokens report scopes; without the repo scope they can't push even with push permission.
    const scopes = headers.get("x-oauth-scopes");
    const isPrivate = repository.private === true;
    const classicScopeMissing =
      scopes !== null &&
      !scopes
        .split(",")
        .map((scope) => scope.trim())
        .some((scope) => scope === "repo" || (!isPrivate && scope === "public_repo"));

    if (permissions.push !== true || classicScopeMissing) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.REPOSITORY_READ_ONLY,
        `This token can read ${name} but can't push to it, so the agent couldn't open a pull request. ${WRITE_ACCESS_HINT}`,
      );
    }

    // GitHub's canonical owner/name and address (case, renames, Enterprise hosts) rather than what was typed.
    const fullName = readString(repository, "full_name") ?? name;
    return {
      fullName,
      url: readString(repository, "html_url") ?? `https://github.com/${fullName}`,
      defaultBranch: readString(repository, "default_branch") ?? "main",
      isPrivate,
    };
  }

  private toError(
    name: string,
    status: number,
    headers: Headers,
    gitHubMessage: string | undefined,
  ): SetupServiceError {
    if (status === 401) {
      return new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.TOKEN_REJECTED,
        "GitHub rejected this token. Check that it was copied in full and hasn't expired or been revoked.",
      );
    }
    if (status === 429 || (status === 403 && headers.get("x-ratelimit-remaining") === "0")) {
      return new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.GITHUB_RATE_LIMITED,
        "GitHub is rate limiting this token right now. Wait a few minutes, then try again.",
      );
    }
    if (status === 403) {
      return new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.REPOSITORY_FORBIDDEN,
        `GitHub refused access to ${name}${gitHubMessage ? `: "${gitHubMessage}"` : ""}. If the organisation uses single sign-on, authorise the token for it.`,
      );
    }
    if (status === 404) {
      return new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.REPOSITORY_NOT_FOUND,
        `Couldn't find ${name} with this token. Check the name, and that the token has access to it (for a fine-grained token, include the repository under Repository access).`,
      );
    }
    return new SetupServiceError(
      SETUP_SERVICE_ERROR_CODE.GITHUB_ERROR,
      `GitHub couldn't check the repository (HTTP ${status}). Try again in a moment.`,
    );
  }
}
