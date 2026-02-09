import type { AgentCLIResult } from "./BaseAgent";
import { BaseAgent } from "./BaseAgent";
import { ExecutionContext } from "../types";
import axios from "axios";
import * as path from "path";

export class QwenCodeAgent extends BaseAgent {
  protected requiresApiKey(): boolean {
    return true;
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    // Check if we should use direct API or CLI
    if (this.config.endpoint && this.config.endpoint.includes("api")) {
      return this.executeViaAPI(prompt, context, workDir);
    } else {
      return this.executeViaCLI(prompt, context, workDir);
    }
  }

  private async executeViaAPI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    try {
      this.logger.info("Executing Qwen Code via API", {
        endpoint: this.config.endpoint,
      });

      // Clone repository to access current code
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");

      // Prepare the API request payload - using DashScope format
      const apiPayload = {
        model: "qwen-turbo", // Using a standard Qwen model
        input: {
          messages: [
            {
              role: "system",
              content: `You are an expert code assistant. Analyze the bug and provide code fixes.
              The current code is in the repository at ${repoDir}.
              Apply coding standards: ${context.codingStandards || "Follow standard practices for the language"}.
              ${context.testRequired ? "Include tests for the fix." : ""}`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        },
        parameters: {
          max_tokens: this.config.maxTokens || 3000,
          temperature: this.config.temperature || 0.2,
        },
      };

      // Determine the API endpoint - using code-specific endpoint if available
      const endpoint =
        this.config.endpoint ||
        (context.codingStandards
          ? "https://dashscope.aliyuncs.com/api/v1/services/aigc/codemodify/text-completion"
          : "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation");
      const headers = {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      };

      // Make the API call to Qwen Code
      const response = await axios.post(endpoint, apiPayload, {
        headers,
        timeout: this.config.executionTimeLimit * 1000,
      });

      if (response.status !== 200) {
        throw new Error(
          `Qwen API request failed with status ${response.status}: ${response.statusText}`,
        );
      }

      const result = response.data;
      this.logger.debug("Qwen API response", { response: result });

      // Extract changed files from the API response
      const changedFiles: string[] = [];

      // Process the response based on DashScope API format
      let content = "";
      if (
        result.output &&
        result.output.choices &&
        result.output.choices.length > 0
      ) {
        content =
          result.output.choices[0].message?.content ||
          result.output.choices[0].text ||
          "";
      } else if (result.result) {
        // Alternative format
        content = result.result;
      }

      // Look for file change indicators in the response
      // This parses code blocks with file paths
      const filePattern = /```(\w+)\s*([\w\/\.\-_]+)\s*\n([\s\S]*?)```/g;
      let match;
      while ((match = filePattern.exec(content)) !== null) {
        const filePath = match[2].trim();
        if (
          filePath &&
          !changedFiles.includes(filePath) &&
          !filePath.startsWith("```")
        ) {
          changedFiles.push(filePath);
        }
      }

      // If no specific file paths found, try to identify changes from the response
      if (changedFiles.length === 0) {
        // Look for file paths in the response text
        const pathPattern = /(?:file:|path:)\s*([^\s\n]+)/gi;
        while ((match = pathPattern.exec(content)) !== null) {
          const filePath = match[1].trim().replace(/['"`]/g, "");
          if (filePath && !changedFiles.includes(filePath)) {
            changedFiles.push(filePath);
          }
        }
      }

      await this.cleanup(workDir);

      return {
        success: true,
        changedFiles,
        commitHash: undefined,
        pullRequestUrl: undefined,
      };
    } catch (error) {
      await this.cleanup(workDir);
      if (axios.isAxiosError(error)) {
        this.logger.error("Qwen API request failed", {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
        throw new Error(`Qwen API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async executeViaCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");
      const promptFile = await this.writePromptToFile(prompt, workDir);

      const args = [
        "code-fix",
        "--api-key",
        this.config.apiKey!,
        "--input-file",
        promptFile,
        "--project-path",
        repoDir,
        "--max-tokens",
        (this.config.maxTokens || 3000).toString(),
      ];

      if (context.testRequired) {
        args.push("--test");
      }

      // Check if we should use qwen-cli or just qwen
      const cliBinary = this.config.name === "qwen-cli" ? "qwen-cli" : "qwen";
      this.logger.info(`Executing ${cliBinary}`, {
        args: args.filter((arg) => arg !== this.config.apiKey),
      });

      const result = await this.executeCommand(cliBinary, args, {
        cwd: workDir,
        timeout: this.config.executionTimeLimit * 1000,
      });

      if (result.exitCode !== 0) {
        throw new Error(`${cliBinary} failed: ${result.stderr}`);
      }

      const changedFiles = await this.getChangedFiles(repoDir);

      const cliOutput = this.parseCliOutput(result.stdout);

      await this.cleanup(workDir);

      return {
        success: true,
        changedFiles,
        commitHash: this.getCliString(cliOutput, "commitHash", "commit"),
        pullRequestUrl: this.getCliString(cliOutput, "pullRequestUrl", "pr_url"),
      };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
