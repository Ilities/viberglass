import { postForJson } from "./callbackFetch";
import type { CallbackTarget } from "./TurnCallbackClient";

export interface PullRequestRequest {
  /** The repository the branch was pushed to. */
  sourceRepository: string;
  /** The repository to open the pull request against. */
  destinationRepository: string;
  head: string;
  base: string;
  title: string;
  body: string;
}

/** Asks the platform to open a pushed branch's pull request through the space's code host. */
export class RepositoryCallbackClient {
  constructor(private readonly target: CallbackTarget) {}

  /** Returns the pull request's address. Throws with the code host's reason when it can't be opened. */
  async openPullRequest(jobId: string, tenantId: string, pullRequest: PullRequestRequest): Promise<string> {
    const body = await postForJson(
      `${this.target.apiUrl}/api/jobs/${jobId}/pull-request`,
      tenantId,
      pullRequest,
      60000,
      this.target.callbackToken,
    );
    const data = typeof body === "object" && body !== null && "data" in body ? body.data : null;
    const url = typeof data === "object" && data !== null && "url" in data ? data.url : null;
    if (typeof url !== "string" || !url) throw new Error("The platform didn't return the pull request's address");
    return url;
  }
}
