/**
 * SessionStateManager — captures and restores CLI agent conversation state.
 *
 * Each CLI agent persists its conversation state to a well-known directory
 * inside $HOME (e.g. ~/.claude/, ~/.codex/). This helper packages those
 * directories into a tar.gz archive and stores it either on S3 (production)
 * or the local filesystem (Docker/local dev).
 *
 * - `captureAndStore()` / `retrieveAndRestore()` are the high-level API.
 * - `captureConversationState()` / `restoreConversationState()` are internal
 *   helpers that deal with tar.gz creation/extraction only.
 */

import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Logger } from "winston";

const SESSION_STATE_ROOT =
  process.env.SESSION_STATE_ROOT || "/tmp/viberglass-session-state";

// Agent name → subdirectory inside $HOME where conversation state lives
const AGENT_STATE_DIRS: Record<string, string> = {
  "claude-code": ".claude",
  codex: ".codex",
  "qwen-cli": ".qwen",
  opencode: ".opencode",
  "gemini-cli": ".gemini",
  "kimi-code": ".kimi",
  "mistral-vibe": ".mistral",
  pi: ".pi",
};

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
 * Returns the HOME-relative state directories for a given agent.
 * Falls back to `.<agentName>/` for unknown agents.
 */
function getStateDirs(agentName: string): string[] {
  const known = AGENT_STATE_DIRS[agentName];
  if (known) return [known];
  return [`.${agentName}`];
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
  const stateDirs = getStateDirs(agentName);
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
// S3 helpers
// ---------------------------------------------------------------------------

async function uploadToS3(
  archiveBuffer: Buffer,
  sessionId: string,
  logger: Logger,
): Promise<string | undefined> {
  const bucketName = process.env.AWS_S3_BUCKET?.trim();
  if (!bucketName) {
    logger.warn("AWS_S3_BUCKET not configured, skipping S3 upload");
    return undefined;
  }

  try {
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "eu-west-1",
    });

    const key = `conversation-state/${sessionId}/${Date.now()}.tar.gz`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: archiveBuffer,
        ContentType: "application/gzip",
      }),
    );

    const s3Url = `s3://${bucketName}/${key}`;
    logger.info("Conversation state archive uploaded to S3", {
      sessionId,
      s3Key: key,
      sizeBytes: archiveBuffer.length,
    });
    return s3Url;
  } catch (err) {
    logger.warn("Failed to upload conversation state to S3", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

async function downloadFromS3(
  s3Url: string,
  logger: Logger,
): Promise<Buffer | undefined> {
  try {
    const match = s3Url.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      logger.warn("Invalid S3 URL format for conversation state", { s3Url });
      return undefined;
    }

    const [, bucket, key] = match;
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "eu-west-1",
    });

    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    if (!response.Body) {
      return undefined;
    }

    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (err) {
    logger.warn("Failed to download conversation state from S3", {
      s3Url,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
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
 * If `AWS_S3_BUCKET` is set → uploads to S3 → returns `s3://` URL.
 * Otherwise → writes to local filesystem → returns `file://` URL.
 *
 * Returns `undefined` if there was nothing to archive or storage failed.
 */
export async function captureAndStore(
  agentName: string,
  sessionId: string,
  homeDir: string,
  logger: Logger,
): Promise<string | undefined> {
  const archiveBuffer = await captureConversationState(agentName, homeDir, logger);
  if (!archiveBuffer) {
    return undefined;
  }

  // Prefer S3 when configured (production)
  if (process.env.AWS_S3_BUCKET?.trim()) {
    const s3Url = await uploadToS3(archiveBuffer, sessionId, logger);
    if (s3Url) return s3Url;
    // Fall through to local if S3 upload fails
  }

  // Local filesystem fallback
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
): Promise<void> {
  let archiveBuffer: Buffer | undefined;

  if (url.startsWith("s3://")) {
    archiveBuffer = await downloadFromS3(url, logger);
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
