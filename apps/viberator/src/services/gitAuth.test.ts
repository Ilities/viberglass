import { gitAuthEnvironment, toRemoteUrl } from "./gitAuth";

describe("toRemoteUrl", () => {
  test("converts scp-style SSH URLs to HTTPS", () => {
    expect(toRemoteUrl("git@github.com:acme/widgets.git")).toBe("https://github.com/acme/widgets.git");
  });

  test("converts ssh:// URLs to HTTPS", () => {
    expect(toRemoteUrl("ssh://git@gitlab.com/acme/widgets.git")).toBe("https://gitlab.com/acme/widgets.git");
  });

  test("leaves HTTPS URLs untouched", () => {
    const url = "https://github.com/acme/widgets.git";
    expect(toRemoteUrl(url)).toBe(url);
  });
});

describe("gitAuthEnvironment", () => {
  const auth = { username: "x-access-token", token: "ghp_example" };

  test("returns a per-invocation config header rather than a credentialed URL", () => {
    const env = gitAuthEnvironment("https://github.com/acme/widgets.git", auth);

    expect(env.GIT_CONFIG_COUNT).toBe("1");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
    const expected = Buffer.from("x-access-token:ghp_example", "utf8").toString("base64");
    expect(env.GIT_CONFIG_VALUE_0).toBe(`Authorization: Basic ${expected}`);
  });

  test("sends the username the code host takes", () => {
    const env = gitAuthEnvironment("https://gitlab.example.com/acme/widgets.git", { username: "oauth2", token: "glpat" });

    expect(env.GIT_CONFIG_VALUE_0).toBe(`Authorization: Basic ${Buffer.from("oauth2:glpat", "utf8").toString("base64")}`);
  });

  test("scopes the header to the repository origin, whatever the host", () => {
    const env = gitAuthEnvironment("https://scm.internal.example/acme/widgets.git", auth);

    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://scm.internal.example/.extraheader");
  });

  test("normalises SSH URLs before deriving the origin", () => {
    const env = gitAuthEnvironment("git@github.com:acme/widgets.git", auth);

    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
  });

  test("returns nothing without credentials or for a URL it can't read", () => {
    expect(gitAuthEnvironment("https://github.com/acme/widgets.git")).toEqual({});
    expect(gitAuthEnvironment("not a url", auth)).toEqual({});
  });
});
