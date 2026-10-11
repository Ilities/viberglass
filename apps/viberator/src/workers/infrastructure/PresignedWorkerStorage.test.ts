import { PresignedWorkerStorage } from "./PresignedWorkerStorage";

const run = { jobId: "run", tenantId: "tenant", callbackToken: "callback", platformApiUrl: "https://backend" };

afterEach(() => jest.restoreAllMocks());

it("authenticates only to the backend and downloads using a scoped signed URL", async () => {
  const fetchMock = jest.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { url: "https://storage/signed", storageUrl: "s3://bucket/key" } })))
    .mockResolvedValueOnce(new Response("instructions"));
  const storage = new PresignedWorkerStorage(run);
  expect((await storage.download("s3://bucket/key")).toString()).toBe("instructions");
  expect(fetchMock.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ "X-Callback-Token": "callback", "X-Tenant-Id": "tenant" }));
  expect(fetchMock.mock.calls[1][1]?.headers).toBeUndefined();
});

it("uploads only to the URL selected by the backend and retains the durable reference", async () => {
  const fetchMock = jest.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { url: "https://storage/upload", storageUrl: "s3://bucket/conversation-state/run.tar.gz" } })))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  expect(await new PresignedWorkerStorage(run).upload(Buffer.from("archive"))).toBe("s3://bucket/conversation-state/run.tar.gz");
  expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ operation: "write" }));
  expect(fetchMock.mock.calls[1][1]?.method).toBe("PUT");
  expect(fetchMock.mock.calls[1][1]?.headers).toEqual({ "Content-Type": "application/gzip" });
});

it("fails before storage access when the run is refused", async () => {
  const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
  await expect(new PresignedWorkerStorage(run).download("s3://bucket/other-run")).rejects.toThrow("HTTP 403");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("reports failed writes instead of returning an unusable local state URL", async () => {
  jest.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { url: "https://storage/upload", storageUrl: "s3://bucket/key" } })))
    .mockResolvedValueOnce(new Response(null, { status: 500 }));
  await expect(new PresignedWorkerStorage(run).upload(Buffer.from("archive"))).rejects.toThrow("HTTP 500");
});
