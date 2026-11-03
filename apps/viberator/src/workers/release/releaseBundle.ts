import { createHash } from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import { pipeline } from "stream/promises";
import * as tar from "tar";

export interface PackedBundle {
  sha256: string;
  bytes: number;
}

/**
 * Packs the built repository, without its git history, as a gzip-compressed
 * tar. Links are kept as links: node_modules/.bin is made of them.
 */
export async function packBundle(repoDir: string, bundleFile: string): Promise<PackedBundle> {
  const entries = fs.readdirSync(repoDir).filter((name) => name !== ".git").sort();
  await tar.create({ gzip: true, cwd: repoDir, file: bundleFile, portable: true, follow: false }, entries);
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(bundleFile), hash);
  return { sha256: hash.digest("hex"), bytes: fs.statSync(bundleFile).size };
}

const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

/** PUTs the bundle to a presigned URL, streamed, with the length the URL's signature expects. */
export function uploadBundle(url: string, bundleFile: string, bytes: number): Promise<void> {
  const target = new URL(url);
  const request = (target.protocol === "https:" ? https : http).request;
  return new Promise((resolve, reject) => {
    const put = request(
      target,
      { method: "PUT", headers: { "Content-Type": "application/gzip", "Content-Length": bytes }, timeout: UPLOAD_TIMEOUT_MS },
      (response) => {
        response.resume();
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          if (status >= 200 && status < 300) resolve();
          else reject(new Error(`Uploading the release bundle failed (HTTP ${status})`));
        });
      },
    );
    put.on("timeout", () => put.destroy(new Error("Uploading the release bundle timed out")));
    put.on("error", reject);
    fs.createReadStream(bundleFile).on("error", reject).pipe(put);
  });
}
