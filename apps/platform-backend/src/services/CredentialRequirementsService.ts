import { getRunnerSignIn, type Clanker, type CredentialRequest } from "@viberglass/types";
import { SecretResolutionService } from "./SecretResolutionService";
import { AgentLoginService } from "./agentLogin/AgentLoginService";

export class CredentialRequirementsService {
  constructor(
    private readonly secretResolutionService: Pick<SecretResolutionService, "getCredentialRequests"> = new SecretResolutionService(),
    private readonly logins: Pick<AgentLoginService, "workerBindings"> = new AgentLoginService(),
  ) {}

  async getRequiredCredentialsForClanker(clanker: Clanker): Promise<CredentialRequest[]> {
    const requests = await this.secretResolutionService.getCredentialRequests(clanker.secretBindings || []);
    const runnerSignIn = getRunnerSignIn(clanker.deploymentConfig);
    if (!runnerSignIn) return requests;

    // The stored login is the worker's: it signs the harness in with it. A runner not signed in yet
    // has none, and the harness asks for a device code on its first run.
    const loginRequests = (await this.secretResolutionService.getCredentialRequests(this.logins.workerBindings(clanker))).map(
      (request) => ({ ...request, exposeToAgent: false }),
    );
    return [...requests.filter((request) => request.envVar !== runnerSignIn.method.credentialEnvVar), ...loginRequests];
  }
}
