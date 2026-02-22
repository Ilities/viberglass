import path from "path";

export type TicketMediaKind = "screenshot" | "recording";

const S3_PREFIX = (process.env.TICKET_MEDIA_S3_PREFIX || "ticket-media").replace(
  /^\/+|\/+$/g,
  "",
);
const DISK_ROOT = process.env.TICKET_MEDIA_DISK_ROOT || "/tmp/viberator-ticket-media";
const CONTAINER_ROOT = process.env.TICKET_MEDIA_CONTAINER_ROOT || "/tmp/viberator-ticket-media";

function normalizeExtension(filename: string): string {
  const extension = path.extname(filename || "").toLowerCase();
  return extension.replace(/[^.a-z0-9]/g, "");
}

function fileNameForMedia(mediaId: string, originalFilename: string): string {
  return `${mediaId}${normalizeExtension(originalFilename)}`;
}

function folderForKind(kind: TicketMediaKind): string {
  return kind === "recording" ? "recordings" : "screenshots";
}

export function buildDiskPath(
  kind: TicketMediaKind,
  mediaId: string,
  originalFilename: string,
): string {
  return path.join(DISK_ROOT, folderForKind(kind), fileNameForMedia(mediaId, originalFilename));
}

export function buildContainerPath(
  kind: TicketMediaKind,
  mediaId: string,
  originalFilename: string,
): string {
  return path.posix.join(
    CONTAINER_ROOT,
    folderForKind(kind),
    fileNameForMedia(mediaId, originalFilename),
  );
}

export function buildS3Key(
  kind: TicketMediaKind,
  mediaId: string,
  originalFilename: string,
): string {
  return `${S3_PREFIX}/${folderForKind(kind)}/${fileNameForMedia(mediaId, originalFilename)}`;
}
