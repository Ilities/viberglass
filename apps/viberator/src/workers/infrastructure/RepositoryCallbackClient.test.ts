import { RepositoryCallbackClient } from "./RepositoryCallbackClient";

const PULL_REQUEST = {
  sourceRepository: "https://github.com/acme/web",
  destinationRepository: "https://github.com/acme/web",
  head: "viberglass/t-1",
  base: "main",
  title: "Fix login",
  body: "Fixes it",
};

describe("RepositoryCallbackClient", () => {
  const client = new RepositoryCallbackClient({ apiUrl: "http://platform", maxRetries: 0, retryDelay: 0, callbackToken: "cb" });

  afterEach(() => jest.restoreAllMocks());

  it("asks the platform to open the pull request and returns its address", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: { url: "https://github.com/acme/web/pull/1" } })));

    await expect(client.openPullRequest("job-1", "tenant-1", PULL_REQUEST)).resolves.toBe("https://github.com/acme/web/pull/1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://platform/api/jobs/job-1/pull-request");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(PULL_REQUEST);
  });

  it("fails with the platform's reason when the code host refuses", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ error: "GitHub PR Creation Failed: Validation Failed" }), { status: 502 }));

    await expect(client.openPullRequest("job-1", "tenant-1", PULL_REQUEST)).rejects.toThrow("GitHub PR Creation Failed");
  });

  it("fails when the platform returns no address", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, data: {} })));

    await expect(client.openPullRequest("job-1", "tenant-1", PULL_REQUEST)).rejects.toThrow("didn't return the pull request's address");
  });
});
