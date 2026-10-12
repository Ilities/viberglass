import { ArtifactPreviewLinks, PREVIEW_LINK_MS } from "../../../../services/artifacts/ArtifactPreviewLinks";

const VERSION = "6f1c2c5e-4f6a-4b8e-9a43-0d2b3c4d5e6f";
const env = { PREVIEW_PUBLIC_URL: "http://127.0.0.1:8890/", SECRETS_ENCRYPTION_KEY: "secret" };

function tokenOf(url: string): string {
  return url.split("/v/")[1].split("/")[0];
}

describe("ArtifactPreviewLinks", () => {
  it("links to the version's entrypoint on the preview origin and verifies its own links", () => {
    const links = new ArtifactPreviewLinks(() => env);
    const link = links.link(VERSION, "deck/my slides#1.html", 1_000_000)!;
    expect(link.url).toMatch(/^http:\/\/127\.0\.0\.1:8890\/v\/[^/]+\/deck\/my%20slides%231\.html$/);
    expect(links.verify(tokenOf(link.url), 1_000_000)).toBe(VERSION);
  });

  it("refuses an expired, tampered or foreign link", () => {
    const links = new ArtifactPreviewLinks(() => env);
    const token = tokenOf(links.link(VERSION, "a.html", 0)!.url);
    expect(links.verify(token, PREVIEW_LINK_MS + 2_000)).toBeNull();
    const [payload, signature] = token.split(".");
    const otherPayload = Buffer.from(`00000000-0000-4000-8000-000000000000.${Math.floor(PREVIEW_LINK_MS / 1000)}`).toString("base64url");
    expect(links.verify(`${otherPayload}.${signature}`, 0)).toBeNull();
    expect(links.verify(payload, 0)).toBeNull();
    expect(new ArtifactPreviewLinks(() => ({ ...env, SECRETS_ENCRYPTION_KEY: "other" })).verify(token, 0)).toBeNull();
  });

  it("offers no link when the preview origin isn't configured", () => {
    expect(new ArtifactPreviewLinks(() => ({ SECRETS_ENCRYPTION_KEY: "secret" })).link(VERSION, "a.html")).toBeNull();
  });
});
