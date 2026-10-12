import express, { type Request, type Response } from "express";
import { ArtifactDAO } from "../persistence/artifacts/ArtifactDAO";
import { ArtifactPreviewLinks } from "../services/artifacts/ArtifactPreviewLinks";
import { objectUrlUnder, S3SpaceFilesStore, type SpaceFilesStore } from "../services/spaceFiles/SpaceFilesStore";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ server: "preview" });

/** The headers every preview response gets, whatever it is. */
export function previewHeaders(appOrigin: string | null, contentType: string): Record<string, string> {
  const pdf = contentType === "application/pdf";
  return {
    "Content-Type": contentType,
    // A sandbox even if the file is opened on its own: scripts run, but with no
    // origin of their own, no forms, no top-level navigation and no network
    // beyond this version's own files. Browsers' PDF viewers don't run sandboxed.
    "Content-Security-Policy": [
      ...(pdf ? [] : ["sandbox allow-scripts allow-popups"]),
      "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' data: blob:",
      "form-action 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      `frame-ancestors ${appOrigin ?? "'none'"}`,
    ].join("; "),
    // Module scripts and fetches from a sandboxed (opaque) origin are cross-origin requests.
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, max-age=300",
  };
}

/**
 * The preview origin: a separate server, on its own host, that serves the
 * files of the one artifact version a signed link names. It reads no cookies
 * and has no other routes.
 */
export function createPreviewApp(
  deps: {
    links?: ArtifactPreviewLinks;
    versions?: Pick<ArtifactDAO, "getVersionById">;
    store?: SpaceFilesStore;
    appOrigin?: string | null;
  } = {},
): express.Express {
  const links = deps.links ?? new ArtifactPreviewLinks();
  const versions = deps.versions ?? new ArtifactDAO();
  const store = deps.store ?? new S3SpaceFilesStore();
  const appOrigin = deps.appOrigin === undefined ? (process.env.PLATFORM_FRONTEND_URL?.replace(/\/+$/, "") ?? null) : deps.appOrigin;

  const app = express();
  app.disable("x-powered-by");

  const notFound = (res: Response, status = 404, message = "Not found") =>
    res.status(status).set({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).send(message);

  app.get(/^\/v\/([^/]+)\/(.*)$/, async (req: Request, res: Response) => {
    try {
      const params = req.params as unknown as Record<string, string>;
      const token = params[0] ?? "";
      const versionId = links.verify(token);
      if (!versionId) return notFound(res, 403, "This preview link has expired. Reopen the artifact to preview it again.");
      const version = await versions.getVersionById(versionId);
      if (!version) return notFound(res);
      if (version.status === "expired") return notFound(res, 410, "This version is no longer kept.");

      let path: string;
      try {
        path = (params[1] ?? "").split("/").map(decodeURIComponent).join("/");
      } catch {
        return notFound(res, 400, "Bad path");
      }
      if (path === "") path = version.entrypoint;
      // Only the files the version declared; anything else, including paths that try to climb out, doesn't exist.
      const file = version.files.find((candidate) => candidate.path === path);
      if (!file) return notFound(res);

      const body = await store.open(objectUrlUnder(version.storagePrefix, file.path));
      res.status(200).set(previewHeaders(appOrigin, file.contentType));
      body.on("error", () => res.destroy());
      body.pipe(res);
    } catch (error) {
      logger.error("Preview failed", { error: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) notFound(res, 500, "The preview couldn't be loaded.");
    }
  });

  app.use((_req, res) => notFound(res));
  return app;
}
