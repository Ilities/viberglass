import { createHmac, timingSafeEqual } from "crypto";

/** How long a preview link works before the app asks for a new one. */
export const PREVIEW_LINK_MS = 60 * 60_000;

const encode = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/**
 * Signed links to one artifact version on the preview origin. The link is the
 * whole capability: the preview origin has no session and no cookies, and a
 * link can't reach another version.
 */
export class ArtifactPreviewLinks {
  constructor(private readonly env: () => Record<string, string | undefined> = () => process.env) {}

  /** Where browsers reach the preview origin; null when it isn't configured, so frames aren't offered. */
  publicUrl(): string | null {
    const url = this.env().PREVIEW_PUBLIC_URL?.trim();
    return url ? url.replace(/\/+$/, "") : null;
  }

  link(versionId: string, entrypoint: string, now = Date.now()): { url: string; expiresAt: string } | null {
    const base = this.publicUrl();
    if (!base) return null;
    const expires = Math.floor((now + PREVIEW_LINK_MS) / 1000);
    const payload = `${versionId}.${expires}`;
    const token = `${encode(payload)}.${encode(this.signature(payload))}`;
    const path = entrypoint.split("/").map(encodeURIComponent).join("/");
    return { url: `${base}/v/${token}/${path}`, expiresAt: new Date(expires * 1000).toISOString() };
  }

  /** The version a link grants, or null when it's forged, malformed or expired. */
  verify(token: string, now = Date.now()): string | null {
    const [encodedPayload, encodedSignature] = token.split(".");
    if (!encodedPayload || !encodedSignature) return null;
    const payload = Buffer.from(encodedPayload, "base64url").toString("utf-8");
    const expected = this.signature(payload);
    const given = Buffer.from(encodedSignature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const [versionId, expires] = payload.split(".");
    if (!versionId || !/^\d+$/.test(expires ?? "") || Number(expires) * 1000 < now) return null;
    return versionId;
  }

  private signature(payload: string): Buffer {
    const secret = this.env().PREVIEW_SIGNING_KEY || this.env().SECRETS_ENCRYPTION_KEY;
    if (!secret) throw new Error("Set PREVIEW_SIGNING_KEY or SECRETS_ENCRYPTION_KEY to sign preview links");
    // Keyed apart from the secrets themselves, so a preview link says nothing about them.
    const key = createHmac("sha256", secret).update("viberglass artifact preview").digest();
    return createHmac("sha256", key).update(payload).digest();
  }
}
