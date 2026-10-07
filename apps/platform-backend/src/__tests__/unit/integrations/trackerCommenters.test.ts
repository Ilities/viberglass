import { GitHubCommenter } from "@viberglass/integration-github";
import { JiraCommenter, markdownToJiraWiki } from "@viberglass/integration-jira";
import { ShortcutCommenter } from "@viberglass/integration-shortcut";

function fetchReturning(status = 201) {
  return jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue(new Response("{}", { status }));
}

function sent(fetchMock: ReturnType<typeof fetchReturning>) {
  const [url, init] = fetchMock.mock.calls[0];
  const headers = new Headers(init?.headers);
  return { url: String(url), headers, body: typeof init?.body === "string" ? JSON.parse(init.body) : null };
}

const issue = (key: string, apiBaseUrl: string | null = null) => ({ key, url: null, apiBaseUrl });

describe("tracker commenters", () => {
  it("comments on a Jira Cloud issue in wiki markup, signing in with the account's email and token", async () => {
    const fetchMock = fetchReturning();
    const commenter = new JiraCommenter({ instanceUrl: "https://acme.atlassian.net/", email: "bot@acme.test", token: "tok" }, fetchMock);

    await commenter.postComment(issue("OPS-1"), "**The plan is ready.**\n\n[Read it](https://vg.test/t/1)");

    const request = sent(fetchMock);
    expect(request.url).toBe("https://acme.atlassian.net/rest/api/2/issue/OPS-1/comment");
    expect(request.headers.get("authorization")).toBe(`Basic ${Buffer.from("bot@acme.test:tok").toString("base64")}`);
    expect(request.body).toEqual({ body: "*The plan is ready.*\n\n[Read it|https://vg.test/t/1]" });
  });

  it("uses the issue's own site and a personal access token on its own", async () => {
    const fetchMock = fetchReturning();
    await new JiraCommenter({ instanceUrl: "https://ignored.test", token: "pat" }, fetchMock).postComment(issue("OPS-2", "https://jira.acme.com/jira"), "Done.");

    const request = sent(fetchMock);
    expect(request.url).toBe("https://jira.acme.com/jira/rest/api/2/issue/OPS-2/comment");
    expect(request.headers.get("authorization")).toBe("Bearer pat");
  });

  it("says what Jira refused", async () => {
    const commenter = new JiraCommenter({ instanceUrl: "https://acme.atlassian.net", email: "bot@acme.test", token: "tok" }, fetchReturning(403));
    await expect(commenter.postComment(issue("OPS-1"), "Hi")).rejects.toThrow("403");
  });

  it("comments on a Shortcut story in Markdown with the API token", async () => {
    const fetchMock = fetchReturning();
    await new ShortcutCommenter({ token: "sc-token" }, fetchMock).postComment(issue("42"), "**Done.**");

    const request = sent(fetchMock);
    expect(request.url).toBe("https://api.app.shortcut.com/api/v3/stories/42/comments");
    expect(request.headers.get("shortcut-token")).toBe("sc-token");
    expect(request.body).toEqual({ text: "**Done.**" });
  });

  it("comments on a GitHub issue from its owner/repo#number key", async () => {
    const fetchMock = fetchReturning();
    await new GitHubCommenter({ token: "gh-token" }, fetchMock).postComment(issue("acme/shop#7"), "**Pull request opened:** https://github.com/acme/shop/pull/8");

    const request = sent(fetchMock);
    expect(request.url).toBe("https://api.github.com/repos/acme/shop/issues/7/comments");
    expect(request.headers.get("authorization")).toBe("Bearer gh-token");
    expect(request.body).toEqual({ body: "**Pull request opened:** https://github.com/acme/shop/pull/8" });
    await expect(new GitHubCommenter({ token: "gh-token" }, fetchMock).postComment(issue("7"), "Hi")).rejects.toThrow("owner/repo#12");
  });
});

describe("markdownToJiraWiki", () => {
  it("converts headings, lists, code and emphasis", () => {
    expect(markdownToJiraWiki("## Plan\n- one\n  - nested\n1. first\nUse `npm test` and *care*.\n```\ncode\n```")).toBe(
      "h2. Plan\n* one\n** nested\n# first\nUse {{npm test}} and _care_.\n{code}\ncode\n{code}",
    );
  });
});
