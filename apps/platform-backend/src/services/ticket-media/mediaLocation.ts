export type MediaLocation =
  | { type: "s3"; bucket: string; key: string }
  | { type: "file"; path: string }
  | { type: "http"; url: string };

function parseS3VirtualHosted(url: URL): { bucket: string; key: string } | null {
  const hostMatch = url.hostname.match(/^(.+)\.s3[.-][^.]+\.amazonaws\.com$/);
  if (!hostMatch || !hostMatch[1]) {
    return null;
  }

  const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!key) {
    return null;
  }

  return {
    bucket: hostMatch[1],
    key,
  };
}

function parseS3PathStyle(url: URL): { bucket: string; key: string } | null {
  const hostMatch = url.hostname.match(/^s3[.-][^.]+\.amazonaws\.com$/);
  if (!hostMatch) {
    return null;
  }

  const segments = url.pathname.replace(/^\/+/, "").split("/");
  if (segments.length < 2 || !segments[0]) {
    return null;
  }

  return {
    bucket: segments[0],
    key: decodeURIComponent(segments.slice(1).join("/")),
  };
}

export function parseMediaLocation(storageUrl: string): MediaLocation {
  try {
    if (storageUrl.startsWith("s3://")) {
      const parsed = new URL(storageUrl);
      return {
        type: "s3",
        bucket: parsed.hostname,
        key: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
      };
    }

    if (storageUrl.startsWith("file://")) {
      const parsed = new URL(storageUrl);
      return {
        type: "file",
        path: decodeURIComponent(parsed.pathname),
      };
    }

    const parsed = new URL(storageUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const s3Virtual = parseS3VirtualHosted(parsed);
      if (s3Virtual) {
        return { type: "s3", ...s3Virtual };
      }

      const s3PathStyle = parseS3PathStyle(parsed);
      if (s3PathStyle) {
        return { type: "s3", ...s3PathStyle };
      }

      return { type: "http", url: storageUrl };
    }
  } catch {
    if (storageUrl.startsWith("/")) {
      return { type: "file", path: storageUrl };
    }
  }

  return { type: "http", url: storageUrl };
}
