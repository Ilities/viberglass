import * as fs from "fs";
import * as path from "path";
import { Logger } from "winston";
import { ConfigLoader } from "../infrastructure/ConfigLoader";
import {
  DockerPayload,
  EcsPayload,
  LambdaPayload,
  WorkerPayload,
} from "../core/types";

export class InstructionFileManager {
  private static readonly CLANKER_AGENTS_FILE = "AGENTS.md";
  private static readonly CLANKER_AGENTS_TARGET_PATH = "agents/AGENTS.md";

  constructor(private readonly logger: Logger) {}

  async loadFromPayload(
    payload: WorkerPayload,
    configLoader: ConfigLoader,
  ): Promise<Map<string, string>> {
    if (payload.workerType === "lambda" || payload.workerType === "ecs") {
      return this.loadAwsInstructionFiles(payload, configLoader);
    }

    return this.loadDockerInstructionFiles(payload);
  }

  async materialize(
    repoDir: string,
    instructionFiles: Map<string, string>,
  ): Promise<void> {
    if (instructionFiles.size === 0) {
      return;
    }

    const gitExcludePath = path.join(repoDir, ".git", "info", "exclude");
    let excludeAppend = "";

    for (const [fileType, content] of instructionFiles.entries()) {
      const targetPath = this.resolveTargetPath(repoDir, fileType);
      if (!targetPath) {
        this.logger.warn("Skipping unsafe instruction file path", { fileType });
        continue;
      }

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.writeFile(targetPath, content, "utf-8");

      const relativePath = path.relative(repoDir, targetPath).replace(/\\/g, "/");
      excludeAppend += `\n${relativePath}`;
    }

    if (excludeAppend) {
      await fs.promises.appendFile(gitExcludePath, excludeAppend, "utf-8");
    }
  }

  private async loadAwsInstructionFiles(
    payload: LambdaPayload | EcsPayload,
    configLoader: ConfigLoader,
  ): Promise<Map<string, string>> {
    const files = await configLoader.fetchInstructionFiles(
      payload.instructionFiles.map((file) => ({
        fileType: file.fileType,
        s3Url: file.s3Url,
      })),
    );

    const instructionFiles = new Map<string, string>();
    for (const file of files) {
      instructionFiles.set(file.fileType, file.content);
    }

    return instructionFiles;
  }

  private loadDockerInstructionFiles(payload: DockerPayload): Map<string, string> {
    const instructionFiles = new Map<string, string>();

    for (const file of payload.instructionFiles) {
      try {
        if (file.content && file.content.trim().length > 0) {
          instructionFiles.set(file.fileType, file.content);
          continue;
        }

        if (file.mountPath && file.mountPath.trim().length > 0) {
          const content = fs.readFileSync(file.mountPath, "utf-8");
          instructionFiles.set(file.fileType, content);
          continue;
        }

        this.logger.debug("Skipping empty instruction file", {
          fileType: file.fileType,
        });
      } catch (error) {
        this.logger.warn("Failed to load instruction file", {
          fileType: file.fileType,
          path: file.mountPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return instructionFiles;
  }

  private resolveTargetPath(repoDir: string, fileType: string): string | null {
    const normalized = path
      .normalize(fileType.replace(/\\/g, "/"))
      .replace(/^(\.\.(\/|\\|$))+/, "");

    if (!normalized || path.isAbsolute(normalized)) {
      return null;
    }

    const relativePath =
      normalized === InstructionFileManager.CLANKER_AGENTS_FILE
        ? InstructionFileManager.CLANKER_AGENTS_TARGET_PATH
        : normalized;

    const targetPath = path.resolve(repoDir, relativePath);
    const resolvedRepoDir = path.resolve(repoDir);

    if (
      targetPath !== resolvedRepoDir &&
      !targetPath.startsWith(`${resolvedRepoDir}${path.sep}`)
    ) {
      return null;
    }

    return targetPath;
  }
}
