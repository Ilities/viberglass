#!/usr/bin/env node
import { ViberatorWorker } from "./viberator";
import { CodingJobData } from "./types";

/**
 * CLI-based ephemeral worker entry point
 *
 * Usage:
 *   docker run viberator-worker --job-data '{"id":"...","tenantId":"..."}'
 *   ecs-run-task --task-def viberator-worker --overrides '{"containerOverrides":[{"name":"worker","command":["--job-data","{...}"}]}'
 */

interface CliArgs {
  jobData?: string;
  "job-file"?: string;
  help?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--job-data":
      case "-j":
        parsed.jobData = args[++i];
        break;
      case "--job-file":
      case "-f":
        parsed["job-file"] = args[++i];
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

function showHelp(): void {
  console.log(`
Viberator Ephemeral Worker

Usage:
  worker [options]

Options:
  -j, --job-data <json>    Job data as JSON string
  -f, --job-file <path>    Path to JSON file containing job data
  -h, --help               Show this help message

Examples:
  # Direct JSON input
  worker --job-data '{"id":"job-123","tenantId":"tenant-abc","repository":"https://github.com/user/repo","task":"Fix the bug"}'

  # File input
  worker --job-file /tmp/job.json

Environment Variables:
  GITHUB_TOKEN              GitHub access token
  CLAUDE_CODE_API_KEY       Claude Code API key
  WORK_DIR                  Working directory (default: /tmp/viberator-work)
  LOG_LEVEL                 Log level (default: info)
  CONFIG_PATH               Path to configuration file
`);
}

async function loadJobData(args: CliArgs): Promise<CodingJobData> {
  if (args["job-file"]) {
    const fs = await import("fs");
    const content = fs.readFileSync(args["job-file"], "utf-8");
    return JSON.parse(content);
  }

  if (args.jobData) {
    return JSON.parse(args.jobData);
  }

  throw new Error(
    "No job data provided. Use --job-data or --job-file argument.",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  try {
    const jobData = await loadJobData(args);

    // Validate required fields
    if (!jobData.id) {
      throw new Error("Missing required field: id");
    }
    if (!jobData.tenantId) {
      throw new Error("Missing required field: tenantId");
    }
    if (!jobData.repository) {
      throw new Error("Missing required field: repository");
    }
    if (!jobData.task) {
      throw new Error("Missing required field: task");
    }

    console.log(`Starting ephemeral worker for job: ${jobData.id}`);

    const worker = new ViberatorWorker();
    await worker.initialize();

    const result = await worker.executeTask(jobData);

    console.log(
      `Job ${jobData.id} completed with status: ${result.success ? "SUCCESS" : "FAILED"}`,
    );
    console.log(JSON.stringify(result, null, 2));

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error("Worker execution failed:", error);
    process.exit(1);
  }
}

main();
