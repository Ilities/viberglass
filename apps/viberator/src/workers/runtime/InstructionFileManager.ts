import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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
  private static readonly HARNESS_CONFIG_PATTERNS = [
    "opencode.json",
    "pi/models.json",
  ];

  constructor(private readonly logger: Logger) {}

  private isHarnessConfigFile(fileType: string): boolean {
    const normalized = path.normalize(fileType.replace(/\\/g, "/"));
    return InstructionFileManager.HARNESS_CONFIG_PATTERNS.some(
      (pattern) => normalized === pattern || normalized.endsWith("/" + pattern),
    );
  }

  async loadFromPayload(
    payload: WorkerPayload,
    configLoader: ConfigLoader,
  ): Promise<Map<string, string>> {
    if (payload.workerType === "lambda" || payload.workerType === "ecs") {
      return this.loadAwsInstructionFiles(payload, configLoader);
    }

    return this.loadDockerInstructionFiles(payload);
  }

  private resolveHomeDirectory(): string {
    const candidates: string[] = [];

    const runtimeHome = process.env.HOME?.trim();
    if (runtimeHome) {
      candidates.push(runtimeHome);
    }

    const systemHome = os.homedir().trim();
    if (systemHome.length > 0) {
      candidates.push(systemHome);
    }

    candidates.push("/tmp");

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
          try {
            const testFile = path.join(candidate, `.write-test-${Date.now()}`);
            fs.writeFileSync(testFile, "test");
            fs.unlinkSync(testFile);
            this.logger.info(
              "InstructionFileManager: Selected writable HOME directory",
              {
                candidate,
              },
            );
            return candidate;
          } catch (err) {
            this.logger.warn(
              "InstructionFileManager: HOME candidate not writable in Lambda",
              {
                candidate,
                error: err instanceof Error ? err.message : String(err),
              },
            );
            continue;
          }
        }
        this.logger.debug("InstructionFileManager: Selected HOME directory", {
          candidate,
        });
        return candidate;
      }
    }

    this.logger.warn(
      "InstructionFileManager: No suitable HOME directory found; falling back to /tmp",
      {
        candidates,
      },
    );
    return "/tmp";
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
      this.logger.info("InstructionFileManager: Materializing file", {
        fileType,
        contentLength: content.length,
      });
      if (this.isHarnessConfigFile(fileType)) {
        const workDir = path.dirname(repoDir);
        const harnessConfigDir = path.join(workDir, ".harness-config");

        // Preserve the relative path within .harness-config/ so that
        // subdirectory patterns like "pi/models.json" land in
        // .harness-config/pi/models.json rather than being flattened.
        const normalizedRelative = path
          .normalize(fileType.replace(/\\/g, "/"))
          .replace(/^(\.\.(\/|\\|$))+/, "");

        if (!normalizedRelative || path.isAbsolute(normalizedRelative)) {
          this.logger.warn(
            "InstructionFileManager: Skipping unsafe harness config path",
            { fileType },
          );
          continue;
        }

        const targetPath = path.resolve(harnessConfigDir, normalizedRelative);
        const resolvedHarnessDir = path.resolve(harnessConfigDir);
        if (
          targetPath !== resolvedHarnessDir &&
          !targetPath.startsWith(`${resolvedHarnessDir}${path.sep}`)
        ) {
          this.logger.warn(
            "InstructionFileManager: Skipping harness config path outside harness dir",
            { fileType },
          );
          continue;
        }

        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.promises.writeFile(targetPath, content, "utf-8");

        this.logger.info(
          "InstructionFileManager: Materialized harness config file",
          {
            fileType,
            targetPath,
          },
        );

        // For OpenCode, also materialize to $HOME/.opencode/opencode.json if HOME is set.
        // Some versions of the CLI or certain commands might not respect OPENCODE_CONFIG_DIR
        // or might need a persistent state dir for the database migration to succeed.
        const configFileName = path.basename(normalizedRelative);
        if (configFileName === "opencode.json") {
          const resolvedHome = this.resolveHomeDirectory();
          const homeOpencodeDir = path.join(resolvedHome, ".opencode");
          const homeTargetPath = path.join(homeOpencodeDir, "opencode.json");
          await fs.promises.mkdir(homeOpencodeDir, { recursive: true });
          await fs.promises.writeFile(homeTargetPath, content, "utf-8");
          this.logger.info(
            "InstructionFileManager: Materialized opencode.json to HOME",
            {
              targetPath: homeTargetPath,
            },
          );
        }
        continue;
      }

      const targetPath = this.resolveTargetPath(repoDir, fileType);
      if (!targetPath) {
        this.logger.warn(
          "InstructionFileManager: Skipping unsafe instruction file path",
          { fileType },
        );
        continue;
      }

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.writeFile(targetPath, content, "utf-8");

      this.logger.info("InstructionFileManager: Materialized file to repo", {
        fileType,
        targetPath,
      });

      const relativePath = path
        .relative(repoDir, targetPath)
        .replace(/\\/g, "/");
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
    this.logger.info(
      "InstructionFileManager: Fetching instruction files for AWS environment",
      {
        count: payload.instructionFiles.length,
        fileTypes: payload.instructionFiles.map((f) => f.fileType),
      },
    );

    const instructionFiles = new Map<string, string>();
    const s3FilesToFetch: Array<{ fileType: string; s3Url: string }> = [];

    for (const file of payload.instructionFiles) {
      if (file.content && file.content.trim().length > 0) {
        this.logger.info(
          "InstructionFileManager: Using inline content for instruction file",
          {
            fileType: file.fileType,
            contentLength: file.content.length,
          },
        );
        instructionFiles.set(file.fileType, file.content);
      } else if (file.s3Url) {
        s3FilesToFetch.push({ fileType: file.fileType, s3Url: file.s3Url });
      } else {
        this.logger.warn(
          "InstructionFileManager: Instruction file missing both content and s3Url",
          {
            fileType: file.fileType,
          },
        );
      }
    }

    if (s3FilesToFetch.length > 0) {
      const fetchedFiles =
        await configLoader.fetchInstructionFiles(s3FilesToFetch);
      for (const file of fetchedFiles) {
        instructionFiles.set(file.fileType, file.content);
      }
    }

    return instructionFiles;
  }

  private loadDockerInstructionFiles(
    payload: DockerPayload,
  ): Map<string, string> {
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
