import type { PullRequestToOpen } from "@viberglass/integration-core";
import { isObjectRecord } from "@viberglass/types";
import type { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import type { IntegrationDAO } from "../../persistence/integrations/IntegrationDAO";
import type { JobBootstrapService } from "../job/JobBootstrapService";
import type { SecretResolutionService } from "../SecretResolutionService";
import type { CodeHosts } from "./codeHosts";
import { PullRequestOpenError } from "./PullRequestOpenError";

interface JobRepositoryConnection {
  integrationId: string;
  credentialSecretId: string | null;
}

/**
 * Opens the pull request for a branch a run pushed, through the code host of
 * the connection the run pushed with and with the same token.
 */
export class JobPullRequestOpener {
  constructor(
    private readonly jobs: Pick<JobBootstrapService, "getBootstrapPayload">,
    private readonly integrations: Pick<IntegrationDAO, "getIntegration">,
    private readonly credentials: Pick<IntegrationCredentialDAO, "getDefaultForIntegration">,
    private readonly secrets: Pick<SecretResolutionService, "resolveSecretValue">,
    private readonly plugins: CodeHosts,
  ) {}

  async open(jobId: string, pullRequest: PullRequestToOpen): Promise<string> {
    const job = await this.jobs.getBootstrapPayload(jobId);
    const connection = readConnection(job?.payload?.scm);
    if (!connection) throw new PullRequestOpenError("The run has no repository connection");

    const integration = await this.integrations.getIntegration(connection.integrationId);
    const host = integration ? this.plugins.get(integration.system)?.repository : undefined;
    if (!host) throw new PullRequestOpenError("The space's code host can't open pull requests");

    const token = await this.token(connection);
    if (!token) throw new PullRequestOpenError("The space's repository connection has no token");
    return host.openPullRequest(pullRequest, token);
  }

  private async token(connection: JobRepositoryConnection): Promise<string | null> {
    const secretId =
      connection.credentialSecretId ??
      (await this.credentials.getDefaultForIntegration(connection.integrationId))?.secretId;
    const value = secretId ? await this.secrets.resolveSecretValue(secretId) : null;
    return value?.trim() ? value : null;
  }
}

function readConnection(scm: unknown): JobRepositoryConnection | null {
  if (!isObjectRecord(scm) || typeof scm.integrationId !== "string") return null;
  return {
    integrationId: scm.integrationId,
    credentialSecretId: typeof scm.credentialSecretId === "string" ? scm.credentialSecretId : null,
  };
}
