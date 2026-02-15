import axios, { AxiosError } from "axios";
import { SCMAuthFactory } from "../../../scm/SCMAuthFactory";
import { GithubClonePreflightValidator } from "../../../services/GithubClonePreflightValidator";

describe("GithubClonePreflightValidator", () => {
  const logger = {
    warn: jest.fn(),
  } as any;

  const githubProvider = {
    getName: () => "GitHub",
    canHandle: () => true,
    getToken: () => "ghp_test_token",
    hasCredentials: () => true,
    authenticateUrl: (repoUrl: string) => repoUrl,
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    logger.warn.mockReset();
  });

  it("skips preflight for non-GitHub repositories", async () => {
    const getProviderSpy = jest
      .spyOn(SCMAuthFactory, "getProvider")
      .mockReturnValue(githubProvider as any);
    const axiosGetSpy = jest.spyOn(axios, "get").mockResolvedValue({} as any);
    const validator = new GithubClonePreflightValidator(logger);

    await validator.validateCloneAccess("https://gitlab.com/org/repo.git");

    expect(getProviderSpy).not.toHaveBeenCalled();
    expect(axiosGetSpy).not.toHaveBeenCalled();
  });

  it("skips preflight when no GitHub token is available", async () => {
    const getProviderSpy = jest
      .spyOn(SCMAuthFactory, "getProvider")
      .mockReturnValue({
        ...githubProvider,
        getToken: () => undefined,
      } as any);
    const axiosGetSpy = jest.spyOn(axios, "get").mockResolvedValue({} as any);
    const validator = new GithubClonePreflightValidator(logger);

    await validator.validateCloneAccess("https://github.com/ilities/viberglass");

    expect(getProviderSpy).toHaveBeenCalledTimes(1);
    expect(axiosGetSpy).not.toHaveBeenCalled();
  });

  it("checks GitHub repository access when token exists", async () => {
    jest
      .spyOn(SCMAuthFactory, "getProvider")
      .mockReturnValue(githubProvider as any);
    const axiosGetSpy = jest.spyOn(axios, "get").mockResolvedValue({} as any);
    const validator = new GithubClonePreflightValidator(logger);

    await validator.validateCloneAccess("https://github.com/ilities/viberglass");

    expect(axiosGetSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/ilities/viberglass",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_test_token",
        }),
      }),
    );
  });

  it("throws a clear error when GitHub token is invalid", async () => {
    jest
      .spyOn(SCMAuthFactory, "getProvider")
      .mockReturnValue(githubProvider as any);
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: { message: "Bad credentials" },
      },
      message: "Request failed with status code 401",
    } as AxiosError;
    jest.spyOn(axios, "get").mockRejectedValue(axiosError);
    const validator = new GithubClonePreflightValidator(logger);

    await expect(
      validator.validateCloneAccess("https://github.com/ilities/viberglass"),
    ).rejects.toThrow(
      "GitHub token validation failed before clone: GITHUB_TOKEN (or GH_TOKEN) is invalid or expired.",
    );
  });

  it("throws a clear error when token lacks repository access", async () => {
    jest
      .spyOn(SCMAuthFactory, "getProvider")
      .mockReturnValue(githubProvider as any);
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: { message: "Resource not accessible by personal access token" },
      },
      message: "Request failed with status code 403",
    } as AxiosError;
    jest.spyOn(axios, "get").mockRejectedValue(axiosError);
    const validator = new GithubClonePreflightValidator(logger);

    await expect(
      validator.validateCloneAccess("https://github.com/ilities/viberglass"),
    ).rejects.toThrow(
      "GitHub token lacks access to ilities/viberglass (Resource not accessible by personal access token).",
    );
  });

  it("does not block clone when preflight endpoint is unavailable", async () => {
    jest
      .spyOn(SCMAuthFactory, "getProvider")
      .mockReturnValue(githubProvider as any);
    jest.spyOn(axios, "get").mockRejectedValue(new Error("ECONNRESET"));
    const validator = new GithubClonePreflightValidator(logger);

    await expect(
      validator.validateCloneAccess("https://github.com/ilities/viberglass"),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
