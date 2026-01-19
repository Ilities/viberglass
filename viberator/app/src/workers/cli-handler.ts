#!/usr/bin/env node
import { ViberatorWorker } from "./viberator";
import { DockerPayload, CodingJobData, JobResult } from "./types";

/**
 * CLI-based ephemeral worker entry point
 *
 * Usage:
 *   docker run viberator-worker --job-data '{"jobId":"...","tenantId":"...","workerType":"docker"}'
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
Viberator Ephemeral Worker (Docker)

Usage:
  worker [options]

Options:
  -j, --job-data <json>    Job data as JSON string (DockerPayload format)
  -f, --job-file <path>    Path to JSON file containing job data
  -h, --help               Show this help message

Examples:
  # Direct JSON input
  worker --job-data '{"jobId":"job-123","tenantId":"tenant-abc","workerType":"docker","repository":"https://github.com/user/repo","task":"Fix the bug","requiredCredentials":["GITHUB_TOKEN"],"instructionFiles":[],"clankerId":"clanker-1"}'

  # File input
  worker --job-file /tmp/job.json

Environment Variables:
  WORK_DIR                  Working directory (default: /tmp/viberator-work)
  LOG_LEVEL                 Log level (default: info)
  CONFIG_PATH               Path to configuration file

Docker Credential Flow:
  Credentials are passed via environment variables at container start (docker run -e GITHUB_TOKEN=...).
  The CredentialProvider checks process.env before SSM, so Docker workers receive credentials from the host.
`);
}

async function loadJobData(args: CliArgs): Promise<DockerPayload> {
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
    const payload = await loadJobData(args);

    // Validate required DockerPayload fields
    if (!payload.jobId) {
      throw new Error("Missing required field: jobId");
    }
    if (!payload.tenantId) {
      throw new Error("Missing required field: tenantId");
    }
    if (!payload.repository) {
      throw new Error("Missing required field: repository");
    }
    if (!payload.task) {
      throw new Error("Missing required field: task");
    }
    if (payload.workerType !== 'docker') {
      throw new Error(`Invalid workerType: ${payload.workerType}. Expected 'docker' for CLI worker.`);
    }

    console.log(`Starting ephemeral worker for job: ${payload.jobId}`);

    // Initialize worker with DockerPayload
    const worker = new ViberatorWorker();
    await worker.initialize(payload);

    // Convert DockerPayload to CodingJobData for executeTask
    const jobData: CodingJobData = {
      id: payload.jobId,
      tenantId: payload.tenantId,
      repository: payload.repository,
      task: payload.task,
      branch: payload.branch,
      baseBranch: payload.baseBranch,
      context: payload.context,
      settings: payload.settings,
      timestamp: Date.now(),
    };

    const result: JobResult = await worker.executeTask(jobData);

    console.log(
      `Job ${payload.jobId} completed with status: ${result.success ? "SUCCESS" : "FAILED"}`,
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
