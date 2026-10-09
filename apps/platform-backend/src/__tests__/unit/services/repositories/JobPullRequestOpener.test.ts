import { JobPullRequestOpener } from "../../../../services/repositories/JobPullRequestOpener";
import { PullRequestOpenError } from "../../../../services/repositories/PullRequestOpenError";
import { fakeRepositoryHost } from "../../../helpers/fakeRepositoryHost";

const PULL_REQUEST = {
  sourceRepository: "https://github.com/acme/web",
  destinationRepository: "https://github.com/acme/web",
  head: "viberglass/t-1",
  base: "main",
  title: "Fix login",
  body: "Fixes it",
};

describe("JobPullRequestOpener", () => {
  const host = fakeRepositoryHost();
  const jobs = { getBootstrapPayload: jest.fn() };
  const integrations = { getIntegration: jest.fn() };
  const credentials = { getDefaultForIntegration: jest.fn() };
  const secrets = { resolveSecretValue: jest.fn() };
  const plugins = { get: (system: string) => (system === "code-host" ? { repository: host } : undefined) };
  const opener = new JobPullRequestOpener(jobs, integrations, credentials, secrets, plugins);

  function runWith(scm: unknown) {
    jobs.getBootstrapPayload.mockResolvedValue({ tenantId: "t", status: "active", payload: { scm } });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    runWith({ integrationId: "integration-1", credentialSecretId: "secret-1" });
    integrations.getIntegration.mockResolvedValue({ id: "integration-1", system: "code-host" });
    secrets.resolveSecretValue.mockResolvedValue("tok");
    host.openPullRequest.mockResolvedValue("https://github.com/acme/web/pull/1");
  });

  it("opens the pull request through the run's code host with the token it pushed with", async () => {
    await expect(opener.open("job-1", PULL_REQUEST)).resolves.toBe("https://github.com/acme/web/pull/1");

    expect(jobs.getBootstrapPayload).toHaveBeenCalledWith("job-1");
    expect(secrets.resolveSecretValue).toHaveBeenCalledWith("secret-1");
    expect(host.openPullRequest).toHaveBeenCalledWith(PULL_REQUEST, "tok");
  });

  it("uses the connection's default credential when the run named none", async () => {
    runWith({ integrationId: "integration-1" });
    credentials.getDefaultForIntegration.mockResolvedValue({ secretId: "secret-default" });

    await opener.open("job-1", PULL_REQUEST);

    expect(credentials.getDefaultForIntegration).toHaveBeenCalledWith("integration-1");
    expect(secrets.resolveSecretValue).toHaveBeenCalledWith("secret-default");
  });

  it.each([
    ["the run has no repository connection", () => runWith(null), "The run has no repository connection"],
    [
      "the connection isn't a code host in this build",
      () => integrations.getIntegration.mockResolvedValue({ id: "integration-1", system: "tracker" }),
      "The space's code host can't open pull requests",
    ],
    ["there's no token", () => secrets.resolveSecretValue.mockResolvedValue(" "), "The space's repository connection has no token"],
  ])("refuses when %s", async (_case, arrange, message) => {
    arrange();

    const opening = opener.open("job-1", PULL_REQUEST);
    await expect(opening).rejects.toBeInstanceOf(PullRequestOpenError);
    await expect(opening).rejects.toThrow(message);
    expect(host.openPullRequest).not.toHaveBeenCalled();
  });
});
