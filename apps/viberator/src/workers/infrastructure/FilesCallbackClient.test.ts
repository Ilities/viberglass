import { FilesCallbackClient, FilesRequestRejected } from "./FilesCallbackClient";

const target = { apiUrl: "http://platform.test", maxRetries: 2, retryDelay: 1, callbackToken: "token-1" };
const saved = { id: "snapshot-2", parentId: null, fileCount: 0, totalBytes: 0, partial: false, changes: { added: 0, changed: 0, removed: 0 }, createdAt: "now" };

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

it("asks for a storage grant with the run's callback credentials", async () => {
  fetchSpy.mockResolvedValueOnce(json(200, { success: true, data: { url: "https://storage.test/get", expiresAt: "soon" } }));

  const grant = await new FilesCallbackClient(target).storageGrant("job 1", "tenant-1", "read");

  expect(grant).toEqual({ url: "https://storage.test/get", expiresAt: "soon" });
  const [url, init] = fetchSpy.mock.calls[0];
  expect(url).toBe("http://platform.test/api/jobs/job%201/files/storage-url");
  expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ operation: "read" }) });
  expect(init.headers).toMatchObject({ "X-Callback-Token": "token-1", "X-Tenant-Id": "tenant-1" });
});

it("retries a save that failed on the platform's side, since saving is idempotent", async () => {
  fetchSpy
    .mockResolvedValueOnce(json(503, { error: "busy" }))
    .mockRejectedValueOnce(new Error("socket hang up"))
    .mockResolvedValueOnce(json(200, { success: true, data: saved }));

  await expect(new FilesCallbackClient(target).checkpoint("job-1", "tenant-1", { sha256: "a".repeat(64), archiveBytes: 10, partial: false }))
    .resolves.toEqual(saved);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

it("doesn't retry a save the platform refused", async () => {
  fetchSpy.mockResolvedValueOnce(json(409, { error: "Another run saved this space first" }));

  const saving = new FilesCallbackClient(target).checkpoint("job-1", "tenant-1", { sha256: "a".repeat(64), archiveBytes: 10, partial: false });

  await expect(saving).rejects.toBeInstanceOf(FilesRequestRejected);
  await expect(saving).rejects.toThrow("Another run saved this space first");
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

it("gives up after its retries", async () => {
  fetchSpy.mockResolvedValue(json(500, { error: "down" }));

  await expect(new FilesCallbackClient(target).checkpoint("job-1", "tenant-1", { sha256: "a".repeat(64), archiveBytes: 10, partial: false }))
    .rejects.toThrow("HTTP 500");
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});
