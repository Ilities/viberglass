import { GitHubRepositoryChecker } from "../../../../services/setup/GitHubRepositoryChecker";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";

const REF = { owner: "acme", repo: "web" };

function respondWith(status: number, body: unknown, headers: Record<string, string> = {}) {
  return jest.fn(async (_url: string, _init: RequestInit) => ({
    status,
    headers: new Headers(headers),
    json: async () => body,
  }));
}

const writableRepository = {
  full_name: "Acme/web",
  default_branch: "develop",
  private: true,
  permissions: { pull: true, push: true },
};

describe("GitHubRepositoryChecker", () => {
  it("returns GitHub's canonical name and default branch when the token can push", async () => {
    const fetchFn = respondWith(200, writableRepository);

    await expect(new GitHubRepositoryChecker(fetchFn).check(REF, "github_pat_abc")).resolves.toEqual({
      fullName: "Acme/web",
      url: "https://github.com/Acme/web",
      defaultBranch: "develop",
      isPrivate: true,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/web",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer github_pat_abc" }),
      }),
    );
  });

  it("says when the token can read but not push", async () => {
    const fetchFn = respondWith(200, { ...writableRepository, permissions: { pull: true, push: false } });

    await expect(new GitHubRepositoryChecker(fetchFn).check(REF, "t")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.REPOSITORY_READ_ONLY,
      message: expect.stringContaining("can read acme/web but can't push to it"),
    });
  });

  it("catches a classic token without the repo scope", async () => {
    const fetchFn = respondWith(200, writableRepository, { "x-oauth-scopes": "read:org, gist" });

    await expect(new GitHubRepositoryChecker(fetchFn).check(REF, "ghp_abc")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.REPOSITORY_READ_ONLY,
    });
  });

  it("accepts public_repo for a public repository", async () => {
    const fetchFn = respondWith(
      200,
      { ...writableRepository, private: false },
      { "x-oauth-scopes": "public_repo" },
    );

    await expect(new GitHubRepositoryChecker(fetchFn).check(REF, "ghp_abc")).resolves.toMatchObject({
      isPrivate: false,
    });
  });

  it.each([
    [401, {}, {}, SETUP_SERVICE_ERROR_CODE.TOKEN_REJECTED, "GitHub rejected this token"],
    [404, {}, {}, SETUP_SERVICE_ERROR_CODE.REPOSITORY_NOT_FOUND, "Couldn't find acme/web"],
    [
      403,
      { message: "Resource protected by organization SAML enforcement." },
      {},
      SETUP_SERVICE_ERROR_CODE.REPOSITORY_FORBIDDEN,
      "SAML enforcement",
    ],
    [403, {}, { "x-ratelimit-remaining": "0" }, SETUP_SERVICE_ERROR_CODE.GITHUB_RATE_LIMITED, "rate limiting"],
    [500, {}, {}, SETUP_SERVICE_ERROR_CODE.GITHUB_ERROR, "HTTP 500"],
  ])("explains HTTP %i", async (status, body, headers, code, message) => {
    const check = new GitHubRepositoryChecker(respondWith(status, body, headers)).check(REF, "t");

    await expect(check).rejects.toMatchObject({ code, message: expect.stringContaining(message) });
  });

  it("says when GitHub can't be reached", async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(new GitHubRepositoryChecker(fetchFn).check(REF, "t")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.GITHUB_UNREACHABLE,
    });
  });

  it("uses GitHub's address for the repository and a configured API base", async () => {
    const fetchFn = respondWith(200, { ...writableRepository, html_url: "https://github.acme.internal/Acme/web" });

    const access = await new GitHubRepositoryChecker(fetchFn, "https://github.acme.internal/api/v3/").check(REF, "t");

    expect(fetchFn).toHaveBeenCalledWith("https://github.acme.internal/api/v3/repos/acme/web", expect.anything());
    expect(access.url).toBe("https://github.acme.internal/Acme/web");
  });
});
