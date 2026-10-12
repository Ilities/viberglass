import {
  ARTIFACT_LIMITS,
  isObjectRecord,
  type ArtifactFormat,
  type ArtifactVersionFile,
  type SpaceFilesManifestEntry,
} from "@viberglass/types";

/** A declared artifact checked against the saved files: every file it names exists. */
export interface ResolvedDeclaration {
  title: string;
  /** Present when the run revises an existing artifact. */
  artifactId: string | null;
  entrypoint: string;
  format: ArtifactFormat;
  files: ArtifactVersionFile[];
  totalBytes: number;
}

export class InvalidArtifactDeclaration extends Error {}

const FORMAT_BY_EXTENSION: Record<string, ArtifactFormat> = {
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  json: "json",
  csv: "csv",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  pdf: "pdf",
  svg: "svg",
  html: "html",
  htm: "html",
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  map: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  pdf: "application/pdf",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function artifactFormatOf(entrypoint: string): ArtifactFormat {
  return FORMAT_BY_EXTENSION[extensionOf(entrypoint)] ?? "other";
}

/** Unknown types are served as bytes, so a browser never guesses one. */
export function contentTypeOf(path: string): string {
  return CONTENT_TYPE_BY_EXTENSION[extensionOf(path)] ?? "application/octet-stream";
}

/** A relative path inside the working directory; a trailing `/` names a folder. */
function relativePath(value: unknown, what: string): string {
  if (typeof value !== "string" || !value.trim()) throw new InvalidArtifactDeclaration(`${what} must be a path.`);
  const path = value.trim().replace(/^\.\//, "");
  const body = path.endsWith("/") ? path.slice(0, -1) : path;
  if (!body || body.startsWith("/") || body.includes("\\") || body.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new InvalidArtifactDeclaration(`${what} "${value}" must be a path inside the working directory.`);
  }
  return path;
}

/**
 * Checks what the agent declared in `.viberglass/artifacts.json` against the
 * files it saved. Throws InvalidArtifactDeclaration with a message the agent's
 * requester can act on.
 */
export function resolveArtifactDeclarations(
  raw: unknown,
  saved: SpaceFilesManifestEntry[],
): ResolvedDeclaration[] {
  if (raw === null || raw === undefined) {
    throw new InvalidArtifactDeclaration("The agent didn't declare an artifact in .viberglass/artifacts.json.");
  }
  if (!isObjectRecord(raw) || !Array.isArray(raw.artifacts)) {
    throw new InvalidArtifactDeclaration('.viberglass/artifacts.json must be {"artifacts": [...]}.');
  }
  if (raw.artifacts.length === 0) {
    throw new InvalidArtifactDeclaration("The agent declared no artifacts in .viberglass/artifacts.json.");
  }
  if (raw.artifacts.length > ARTIFACT_LIMITS.artifactsPerRun) {
    throw new InvalidArtifactDeclaration(`A run can declare at most ${ARTIFACT_LIMITS.artifactsPerRun} artifacts.`);
  }
  const byPath = new Map(saved.map((entry) => [entry.path, entry]));
  const seenIds = new Set<string>();

  return raw.artifacts.map((item, index) => {
    const label = `Artifact ${index + 1}`;
    if (!isObjectRecord(item)) throw new InvalidArtifactDeclaration(`${label} must be an object.`);
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) throw new InvalidArtifactDeclaration(`${label} needs a title.`);
    if (title.length > ARTIFACT_LIMITS.titleLength) {
      throw new InvalidArtifactDeclaration(`${label}'s title is longer than ${ARTIFACT_LIMITS.titleLength} characters.`);
    }
    let artifactId: string | null = null;
    if (item.artifactId !== undefined && item.artifactId !== null) {
      if (typeof item.artifactId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.artifactId)) {
        throw new InvalidArtifactDeclaration(`"${title}" has an artifactId that isn't an artifact's id.`);
      }
      if (seenIds.has(item.artifactId)) throw new InvalidArtifactDeclaration(`"${title}" revises an artifact declared twice.`);
      seenIds.add(item.artifactId);
      artifactId = item.artifactId.toLowerCase();
    }

    const entrypoint = relativePath(item.entrypoint, `"${title}"'s entrypoint`);
    if (!byPath.has(entrypoint)) {
      throw new InvalidArtifactDeclaration(`"${title}"'s entrypoint ${entrypoint} isn't in the saved files.`);
    }
    if (item.files !== undefined && !Array.isArray(item.files)) {
      throw new InvalidArtifactDeclaration(`"${title}"'s files must be a list of paths.`);
    }
    const wanted = new Set<string>([entrypoint]);
    for (const declared of (item.files as unknown[] | undefined) ?? []) {
      const path = relativePath(declared, `A file of "${title}"`);
      if (path.endsWith("/")) {
        const inFolder = saved.filter((entry) => entry.path.startsWith(path));
        if (inFolder.length === 0) throw new InvalidArtifactDeclaration(`"${title}" names the folder ${path}, which has no saved files.`);
        for (const entry of inFolder) wanted.add(entry.path);
      } else {
        if (!byPath.has(path)) throw new InvalidArtifactDeclaration(`"${title}" names ${path}, which isn't in the saved files.`);
        wanted.add(path);
      }
    }
    if (wanted.size > ARTIFACT_LIMITS.filesPerVersion) {
      throw new InvalidArtifactDeclaration(`"${title}" has more than ${ARTIFACT_LIMITS.filesPerVersion} files.`);
    }

    const files = [...wanted].sort().map((path) => {
      const entry = byPath.get(path)!;
      return { ...entry, contentType: contentTypeOf(path) };
    });
    return {
      title,
      artifactId,
      entrypoint,
      format: artifactFormatOf(entrypoint),
      files,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    };
  });
}
