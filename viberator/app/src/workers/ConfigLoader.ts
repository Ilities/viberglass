import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Logger } from "winston";

/**
 * Instruction file fetched from S3
 */
export interface InstructionFile {
  fileType: string;
  content: string;
}

/**
 * S3 URL components
 */
interface S3UrlComponents {
  bucket: string;
  key: string;
}

/**
 * ConfigLoader handles fetching configuration files from S3
 *
 * Uses platform AWS credentials (IAM role in Lambda/EC2, env vars, or ~/.aws/credentials).
 * Implements soft fail pattern: logs warnings but continues on fetch errors.
 */
export class ConfigLoader {
  private s3Client: S3Client;
  private logger: Logger;

  constructor(logger: Logger, config?: { region?: string }) {
    this.logger = logger;
    this.s3Client = new S3Client({
      region: config?.region || process.env.AWS_REGION || "us-east-1",
    });
  }

  /**
   * Parse S3 URL into bucket and key components
   * Supports s3://bucket/key format
   *
   * @param s3Url - S3 URL in format s3://bucket/key
   * @returns Bucket and key components
   */
  private parseS3Url(s3Url: string): S3UrlComponents {
    try {
      const url = new URL(s3Url);
      const bucket = url.hostname;
      const key = url.pathname.slice(1); // Remove leading slash
      return { bucket, key };
    } catch (error) {
      this.logger.error("Invalid S3 URL format", {
        s3Url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Invalid S3 URL: ${s3Url}`);
    }
  }

  /**
   * Fetch a single instruction file from S3
   *
   * @param s3Url - S3 URL in format s3://bucket/key
   * @returns File content or null if fetch fails (soft fail)
   */
  async fetchInstructionFile(s3Url: string): Promise<string | null> {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);

      this.logger.debug("Fetching instruction file from S3", {
        bucket,
        key,
        s3Url,
      });

      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      // Body.transformToString() from AWS SDK v3
      if (!response.Body) {
        throw new Error('Empty response body from S3');
      }
      const content = await response.Body.transformToString();

      this.logger.debug("Successfully fetched instruction file from S3", {
        bucket,
        key,
        contentLength: content.length,
      });

      return content;
    } catch (error) {
      // Log warning but continue (per CONTEXT.md decision)
      this.logger.warn("Failed to fetch instruction file from S3", {
        s3Url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetch multiple instruction files in parallel
   *
   * @param files - Array of file references with fileType and s3Url
   * @returns Array of successfully fetched files
   */
  async fetchInstructionFiles(
    files: Array<{ fileType: string; s3Url: string }>
  ): Promise<InstructionFile[]> {
    const results: InstructionFile[] = [];

    await Promise.all(
      files.map(async (file) => {
        const content = await this.fetchInstructionFile(file.s3Url);
        if (content) {
          results.push({ fileType: file.fileType, content });
        } else {
          this.logger.warn("Skipping instruction file due to fetch failure", {
            fileType: file.fileType,
            s3Url: file.s3Url,
          });
        }
      })
    );

    this.logger.info("Fetched instruction files from S3", {
      total: files.length,
      successful: results.length,
      failed: files.length - results.length,
    });

    return results;
  }

  /**
   * Parse config file content based on file type
   *
   * @param content - File content as string
   * @param fileType - File type/extension (e.g., 'agents.md', 'config.json')
   * @returns Parsed config object or null if parsing fails
   */
  parseConfig(
    content: string,
    fileType: string
  ): Record<string, unknown> | null {
    try {
      // For markdown files, return as-is with type marker
      if (fileType.endsWith(".md")) {
        return { content, type: "markdown" };
      }

      // Try JSON parsing for non-markdown files
      return JSON.parse(content);
    } catch (error) {
      // Log warning but continue (per CONTEXT.md decision)
      this.logger.warn("Failed to parse config file", {
        fileType,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
