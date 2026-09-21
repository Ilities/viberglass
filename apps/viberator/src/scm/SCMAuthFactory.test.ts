import { SCMAuthFactory } from "./SCMAuthFactory";

describe("SCMAuthFactory.toRemoteUrl", () => {
  test("converts scp-style SSH URLs to HTTPS", () => {
    expect(SCMAuthFactory.toRemoteUrl("git@github.com:acme/widgets.git")).toBe(
      "https://github.com/acme/widgets.git",
    );
  });

  test("converts ssh:// URLs to HTTPS", () => {
    expect(
      SCMAuthFactory.toRemoteUrl("ssh://git@gitlab.com/acme/widgets.git"),
    ).toBe("https://gitlab.com/acme/widgets.git");
  });

  test("leaves HTTPS URLs untouched", () => {
    const url = "https://github.com/acme/widgets.git";
    expect(SCMAuthFactory.toRemoteUrl(url)).toBe(url);
  });
});

describe("SCMAuthFactory.buildGitAuthEnvironment", () => {
  const touched: string[] = [];
  let ambientEnv: NodeJS.ProcessEnv;

  function setEnv(name: string, value: string): void {
    touched.push(name);
    process.env[name] = value;
  }

  beforeEach(() => {
    // The providers fall back to scanning the ambient environment for anything
    // token-shaped, so a developer's own GITHUB_TOKEN would otherwise leak in.
    ambientEnv = process.env;
    process.env = { PATH: ambientEnv.PATH };
  });

  afterEach(() => {
    touched.length = 0;
    process.env = ambientEnv;
  });

  test("returns a per-invocation config header rather than a credentialed URL", () => {
    const env = SCMAuthFactory.buildGitAuthEnvironment(
      "https://github.com/acme/widgets.git",
      "ghp_example",
    );

    expect(env.GIT_CONFIG_COUNT).toBe("1");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");

    const expected = Buffer.from("x-access-token:ghp_example", "utf8").toString(
      "base64",
    );
    expect(env.GIT_CONFIG_VALUE_0).toBe(`Authorization: Basic ${expected}`);
  });

  test("scopes the header to the repository origin, not all hosts", () => {
    const env = SCMAuthFactory.buildGitAuthEnvironment(
      "https://gitlab.example.com/acme/widgets.git",
      "glpat_example",
    );

    expect(env.GIT_CONFIG_KEY_0).toBe(
      "http.https://gitlab.example.com/.extraheader",
    );
  });

  test("normalises SSH URLs before deriving the origin", () => {
    const env = SCMAuthFactory.buildGitAuthEnvironment(
      "git@github.com:acme/widgets.git",
      "ghp_example",
    );

    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
  });

  test("resolves the token from the environment when none is passed", () => {
    setEnv("GITHUB_TOKEN", "ghp_from_env");

    const env = SCMAuthFactory.buildGitAuthEnvironment(
      "https://github.com/acme/widgets.git",
    );

    const expected = Buffer.from("x-access-token:ghp_from_env", "utf8").toString(
      "base64",
    );
    expect(env.GIT_CONFIG_VALUE_0).toBe(`Authorization: Basic ${expected}`);
  });

  test("returns nothing when no credentials are available", () => {
    expect(
      SCMAuthFactory.buildGitAuthEnvironment(
        "https://github.com/acme/widgets.git",
      ),
    ).toEqual({});
  });

  test("returns nothing for an unrecognised host", () => {
    expect(
      SCMAuthFactory.buildGitAuthEnvironment(
        "https://scm.internal.example/acme/widgets.git",
        "some-token",
      ),
    ).toEqual({});
  });
});
