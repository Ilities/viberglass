import * as fs from "fs";
import * as path from "path";
import type { AgentType } from "@viberglass/types";
import { Logger } from "winston";
import { ConfigLoader } from "../infrastructure/ConfigLoader";
import type { WorkerPayload } from "../core/types";

export interface LoadedAgentConfigFile {
  fileType: string;
  content: string;
}

export interface MaterializedAgentConfigFile {
  environment?: Record<string, string>;
}

function isSafeRelativePath(fileType: string): boolean {
  const normalized = path
    .normalize(fileType.replace(/\\/g, "/"))
    .replace(/^(\.\.(\/|\\|$))+/, "");

  return Boolean(normalized) && !path.isAbsolute(normalized);
}

export class AgentConfigFileManager {
  constructor(private readonly logger: Logger) {}

  async loadFromPayload(
    payload: WorkerPayload,
    configLoader: ConfigLoader,
  ): Promise<LoadedAgentConfigFile | null> {
    const file = payload.agentConfigFile;
    if (!file?.fileType) {
      return null;
    }

    if (file.content && file.content.trim()) {
      return {
        fileType: file.fileType,
        content: file.content,
      };
    }

    if (file.mountPath && file.mountPath.trim()) {
      return {
        fileType: file.fileType,
        content: fs.readFileSync(file.mountPath, "utf-8"),
      };
    }

    if (file.s3Url && file.s3Url.trim()) {
      const content = await configLoader.fetchInstructionFile(file.s3Url);
      if (!content) {
        return null;
      }

      return {
        fileType: file.fileType,
        content,
      };
    }

    return null;
  }

  async materialize(
    jobWorkDir: string,
    repoDir: string,
    agent: AgentType | string | null | undefined,
    file: LoadedAgentConfigFile | null,
  ): Promise<MaterializedAgentConfigFile> {
    if (!file || !isSafeRelativePath(file.fileType)) {
      return {};
    }

    if (agent === "codex") {
      const targetPath = path.resolve(jobWorkDir, file.fileType);
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.writeFile(targetPath, file.content, "utf-8");

      return {
        environment: {
          CODEX_HOME: path.dirname(targetPath),
        },
      };
    }

    if (agent === "gemini-cli") {
      const targetPath = path.resolve(jobWorkDir, file.fileType);
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.writeFile(targetPath, file.content, "utf-8");

      return {
        environment: {
          HOME: path.dirname(path.dirname(targetPath)),
        },
      };
    }

    const targetPath = path.resolve(repoDir, file.fileType);
    const resolvedRepoDir = path.resolve(repoDir);
    if (
      targetPath !== resolvedRepoDir &&
      !targetPath.startsWith(`${resolvedRepoDir}${path.sep}`)
    ) {
      this.logger.warn("Skipping unsafe native agent config file path", {
        fileType: file.fileType,
      });
      return {};
    }

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, file.content, "utf-8");

    if (agent === "opencode") {
      return {
        environment: {
          OPENCODE_CONFIG: targetPath,
        },
      };
    }

    return {};
  }
}
