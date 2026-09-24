import { parseGitHubRepository } from "../../../../services/setup/gitHubRepository";

describe("parseGitHubRepository", () => {
  it.each([
    "acme/web",
    "https://github.com/acme/web",
    "https://github.com/acme/web.git",
    "https://github.com/acme/web/",
    "https://github.com/acme/web/tree/main/src",
    "github.com/acme/web",
    "http://www.github.com/acme/web?tab=readme",
    "git@github.com:acme/web.git",
    "  acme/web  ",
  ])("reads %s", (input) => {
    expect(parseGitHubRepository(input)).toEqual({ owner: "acme", repo: "web" });
  });

  it("keeps dots and dashes in names", () => {
    expect(parseGitHubRepository("ilities/token.observer")).toEqual({
      owner: "ilities",
      repo: "token.observer",
    });
  });

  it.each(["web", "https://gitlab.com/acme/web", "acme/web/extra", "acme/..", ""])(
    "refuses %p",
    (input) => {
      expect(parseGitHubRepository(input)).toBeNull();
    },
  );
});
