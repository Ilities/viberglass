import { Readable } from "stream";
import request from "supertest";
import { createPreviewApp } from "../../../api/previewServer";
import type { StoredArtifactVersion } from "../../../persistence/artifacts/ArtifactDAO";
import { ArtifactPreviewLinks } from "../../../services/artifacts/ArtifactPreviewLinks";

jest.mock("../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const VERSION_ID = "6f1c2c5e-4f6a-4b8e-9a43-0d2b3c4d5e6f";
const links = new ArtifactPreviewLinks(() => ({ PREVIEW_PUBLIC_URL: "http://preview.test", SECRETS_ENCRYPTION_KEY: "secret" }));

function version(overrides: Partial<StoredArtifactVersion> = {}): StoredArtifactVersion {
  return {
    id: VERSION_ID, artifactId: "a-1", number: 1, format: "html", entrypoint: "deck/index.html", fileCount: 2, totalBytes: 30,
    status: "available", producedBy: { kind: "run", jobId: "job-1", taskId: null }, createdAt: "", projectId: "space-1",
    storagePrefix: "s3://bucket/spaces/space-1/artifacts/a-1/versions/v-1/files/",
    files: [
      { path: "deck/index.html", bytes: 20, sha256: "a", contentType: "text/html; charset=utf-8" },
      { path: "deck/app.js", bytes: 10, sha256: "b", contentType: "text/javascript; charset=utf-8" },
    ],
    ...overrides,
  };
}

function setup(found: StoredArtifactVersion | null = version()) {
  const store = {
    bucket: () => "bucket",
    sign: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    open: jest.fn(async (url: string) => Readable.from([url.endsWith("app.js") ? "console.log(1)" : "<h1>Deck</h1>"])),
  };
  const app = createPreviewApp({ links, versions: { getVersionById: jest.fn().mockResolvedValue(found) }, store, appOrigin: "http://localhost:3000" });
  const path = (file: string) => new URL(links.link(VERSION_ID, file)!.url).pathname;
  return { app, store, path };
}

describe("the preview origin", () => {
  it("serves the version's files sandboxed, framed only by the app, and readable from an opaque origin", async () => {
    const { app, path } = setup();
    const response = await request(app).get(path("deck/index.html"));
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.headers["content-security-policy"]).toContain("sandbox allow-scripts");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors http://localhost:3000");
    expect(response.headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("resolves relative assets under the same link", async () => {
    const { app, path } = setup();
    const base = path("deck/index.html").replace(/index\.html$/, "");
    const response = await request(app).get(`${base}app.js`);
    expect(response.status).toBe(200);
    expect(response.text).toBe("console.log(1)");
  });

  it.each(["deck/other.html", "deck/../secrets.txt", "deck/%2e%2e/secrets.txt"])("has nothing at %s", async (file) => {
    const { app, path, store } = setup();
    const base = path("deck/index.html").replace(/deck\/index\.html$/, "");
    expect((await request(app).get(`${base}${file}`)).status).toBe(404);
    expect(store.open).not.toHaveBeenCalled();
  });

  it("refuses a forged link and an expired version", async () => {
    const forged = setup();
    expect((await request(forged.app).get("/v/forged.token/deck/index.html")).status).toBe(403);
    const expired = setup(version({ status: "expired" }));
    expect((await request(expired.app).get(expired.path("deck/index.html"))).status).toBe(410);
  });
});
