/**
 * SessionStateManager — captures and restores CLI agent conversation state.
 *
 * Each CLI agent persists its conversation state to a well-known directory
 * inside $HOME (e.g. ~/.claude/, ~/.codex/). This helper packages those
 * directories into a tar.gz archive and stores it in object storage, or on the
 * local filesystem for Docker/local dev workers that run on one host.
 *
 * - `captureAndStore()` / `retrieveAndRestore()` are the high-level API.
 * - `captureConversationState()` / `restoreConversationState()` are internal
 *   helpers that deal with tar.gz creation/extraction only.
 */

import { objectStorageBucket } from "@viberglass/types";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { S3WorkerStorage } from "../infrastructure/S3WorkerStorage";
import type { WorkerObjectStorage } from "../infrastructure/workerObjectStorage";
import { Logger } from "winston";
import { agentRegistry } from "../../agents/registerPlugins";

const SESSION_STATE_ROOT =
  process.env.SESSION_STATE_ROOT || "/tmp/viberglass-session-state";

// Patterns to exclude from the archive — large/irrelevant directories that
// would bloat the archive and make capture extremely slow (node_modules can
// easily be hundreds of MB).
const TAR_EXCLUDES = [
  "--exclude",
  "node_modules",
  "--exclude",
  ".cache",
  "--exclude",
  ".npm",
  "--exclude",
  "_cacache",
  "--exclude",
  "*.log",
];

/**
 * The HOME-relative state paths for a given agent, and what to leave out of
 * them. Falls back to `.<agentName>/` for unknown agents.
 */
function getStateDirs(agentName: string): { dirs: string[]; excludes: string[] } {
  return agentRegistry().getStateDirs()[agentName] ?? { dirs: [`.${agentName}`], excludes: [] };
}

// ---------------------------------------------------------------------------
// Internal tar.gz helpers
// ---------------------------------------------------------------------------

/**
 * Creates a tar.gz archive of the agent's conversation state directories.
 * Returns a Buffer of the archive, or undefined if there is nothing to archive.
 */
async function captureConversationState(
  agentName: string,
  homeDir: string,
  logger: Logger,
): Promise<Buffer | undefined> {
  const { dirs: stateDirs, excludes } = getStateDirs(agentName);
  const existingPaths: string[] = [];

  for (const dir of stateDirs) {
    const full = path.join(homeDir, dir);
    if (fs.existsSync(full)) {
      existingPaths.push(dir);
    }
  }

  if (existingPaths.length === 0) {
    logger.info("No conversation state directories found to capture", {
      agentName,
      checkedDirs: stateDirs,
    });
    return undefined;
  }

  const archivePath = path.join(homeDir, `conv-state-${Date.now()}.tar.gz`);

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "czf",
        archivePath,
        ...TAR_EXCLUDES,
        ...excludes.flatMap((exclude) => ["--exclude", exclude]),
        "-C",
        homeDir,
        ...existingPaths,
      ];
      execFile("tar", args, { timeout: 30_000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const buffer = fs.readFileSync(archivePath);
    logger.info("Captured conversation state", {
      agentName,
      dirs: existingPaths,
      archiveSizeBytes: buffer.length,
    });
    return buffer;
  } finally {
    try {
      fs.unlinkSync(archivePath);
    } catch {
      // best effort
    }
  }
}

/**
 * Restores conversation state from a tar.gz archive to the target home directory.
 */
async function restoreConversationState(
  archiveBuffer: Buffer,
  targetHomeDir: string,
  logger: Logger,
): Promise<void> {
  const archivePath = path.join(
    targetHomeDir,
    `conv-state-restore-${Date.now()}.tar.gz`,
  );

  try {
    fs.writeFileSync(archivePath, archiveBuffer);

    await new Promise<void>((resolve, reject) => {
      execFile(
        "tar",
        ["xzf", archivePath, "-C", targetHomeDir],
        { timeout: 30_000 },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    logger.info("Restored conversation state", {
      targetDir: targetHomeDir,
      archiveSizeBytes: archiveBuffer.length,
    });
  } finally {
    try {
      fs.unlinkSync(archivePath);
    } catch {
      // best effort
    }
  }
}

// ---------------------------------------------------------------------------
// Local filesystem helpers
// ---------------------------------------------------------------------------

function writeToLocalStorage(
  archiveBuffer: Buffer,
  sessionId: string,
  logger: Logger,
): string {
  const sessionDir = path.join(SESSION_STATE_ROOT, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const archivePath = path.join(sessionDir, "state.tar.gz");
  fs.writeFileSync(archivePath, archiveBuffer);

  const fileUrl = `file://${archivePath}`;
  logger.info("Conversation state archive saved to local filesystem", {
    sessionId,
    path: archivePath,
    sizeBytes: archiveBuffer.length,
  });
  return fileUrl;
}

function readFromLocalStorage(
  fileUrl: string,
  logger: Logger,
): Buffer | undefined {
  // Strip file:// prefix
  const filePath = fileUrl.replace(/^file:\/\//, "");

  if (!fs.existsSync(filePath)) {
    logger.warn("Local conversation state archive not found", { filePath });
    return undefined;
  }

  const buffer = fs.readFileSync(filePath);
  logger.info("Read conversation state archive from local filesystem", {
    filePath,
    sizeBytes: buffer.length,
  });
  return buffer;
}

// ---------------------------------------------------------------------------
// Public high-level API
// ---------------------------------------------------------------------------

/**
 * Captures the agent's conversation state and stores it.
 *
 * With `storage` (remote workers) → stores there, and throws if it can't.
 * Otherwise, if a bucket is configured → uploads to S3 → returns `s3://` URL.
 * Otherwise, or if that upload fails → writes to local filesystem → returns `file://` URL.
 *
 * Returns `undefined` if there was nothing to archive.
 */
export async function captureAndStore(
  agentName: string,
  sessionId: string,
  homeDir: string,
  logger: Logger,
  storage?: WorkerObjectStorage,
): Promise<string | undefined> {
  const archiveBuffer = await captureConversationState(agentName, homeDir, logger);
  if (!archiveBuffer) {
    return undefined;
  }
  if (storage) {
    const url = await storage.upload(archiveBuffer, sessionId);
    logger.info("Conversation state archive stored", { sessionId, url, sizeBytes: archiveBuffer.length });
    return url;
  }

  if (objectStorageBucket(process.env)) {
    try {
      const url = await new S3WorkerStorage().upload(archiveBuffer, sessionId);
      logger.info("Conversation state archive stored", { sessionId, url, sizeBytes: archiveBuffer.length });
      return url;
    } catch (err) {
      logger.warn("Failed to upload conversation state to S3", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return writeToLocalStorage(archiveBuffer, sessionId, logger);
}

/**
 * Retrieves and restores conversation state from a URL.
 *
 * `s3://` → downloads from S3 → extracts to home dir.
 * `file://` → reads local file → extracts to home dir.
 */
export async function retrieveAndRestore(
  url: string,
  homeDir: string,
  logger: Logger,
  storage?: WorkerObjectStorage,
): Promise<void> {
  let archiveBuffer: Buffer | undefined;
  if (storage && !url.startsWith("s3://")) throw new Error("Remote workers require durable object-storage session state");

  if (url.startsWith("s3://")) {
    archiveBuffer = await (storage ?? new S3WorkerStorage()).download(url);
  } else if (url.startsWith("file://")) {
    archiveBuffer = readFromLocalStorage(url, logger);
  } else {
    logger.warn("Unsupported conversation state URL scheme", { url });
    return;
  }

  if (archiveBuffer) {
    await restoreConversationState(archiveBuffer, homeDir, logger);
    logger.info("Conversation state restored", { conversationStateUrl: url });
  }
}
