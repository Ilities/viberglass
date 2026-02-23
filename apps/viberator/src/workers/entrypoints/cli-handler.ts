#!/usr/bin/env node
import { ViberatorWorker } from "../core/ViberatorWorker";
import { DockerPayload, CodingJobData, JobResult } from "../core/types";
import { ClankerAgentAuthLifecycleFactory } from "../runtime/ClankerAgentAuthLifecycleFactory";

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
  "job-ref"?: string;
  help?: boolean;
}

function readStringField(
  value: unknown,
  field: "error" | "message",
): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const candidate = record[field];
  return typeof candidate === "string" ? candidate : undefined;
}

function readDataField<T>(value: unknown): T | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return (record["data"] as T | undefined) ?? undefined;
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
      case "--job-ref":
      case "-r":
        parsed["job-ref"] = args[++i];
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
  -r, --job-ref <jobId>    Fetch job bootstrap payload from platform API by job ID
  -h, --help               Show this help message

Examples:
  # Direct JSON input
  worker --job-data '{"jobId":"job-123","tenantId":"tenant-abc","workerType":"docker","repository":"https://github.com/user/repo","task":"Fix the bug","requiredCredentials":["GITHUB_TOKEN"],"instructionFiles":[],"clankerId":"clanker-1"}'

  # File input
  worker --job-file /tmp/job.json

  # Reference input (recommended for ECS/Fargate)
  worker --job-ref job_1739123456789_a1b2c3d4

Environment Variables:
  WORK_DIR                  Working directory (default: /tmp/viberator-work)
  LOG_LEVEL                 Log level (default: info)
  CONFIG_PATH               Path to configuration file
  PLATFORM_API_URL          Base URL for platform callbacks/bootstrap API
  CALLBACK_TOKEN            Callback token for bootstrap/result/progress auth
  TENANT_ID                 Tenant identifier used for bootstrap auth header

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

  if (args["job-ref"]) {
    const callbackToken = process.env.CALLBACK_TOKEN;
    if (!callbackToken) {
      throw new Error(
        "Missing CALLBACK_TOKEN environment variable for --job-ref bootstrap fetch.",
      );
    }

    const platformApiUrl =
      process.env.PLATFORM_API_URL || "http://localhost:8888";
    const tenantId = process.env.TENANT_ID || "api-server";
    const endpoint = `${platformApiUrl}/api/jobs/${encodeURIComponent(args["job-ref"])}/bootstrap`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Callback-Token": callbackToken,
        "X-Tenant-Id": tenantId,
      },
    });

    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => undefined);
      const message =
        readStringField(errorBody, "error") ??
        readStringField(errorBody, "message") ??
        response.statusText;
      throw new Error(
        `Failed to fetch bootstrap payload for ${args["job-ref"]}: ${message}`,
      );
    }

    const parsed: unknown = await response.json();
    const data = readDataField<DockerPayload>(parsed);
    if (!data) {
      throw new Error(
        `Bootstrap response for ${args["job-ref"]} did not include payload data.`,
      );
    }

    return data;
  }

  if (args.jobData) {
    return JSON.parse(args.jobData);
  }

  throw new Error(
    "No job data provided. Use --job-data, --job-file, or --job-ref argument.",
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
    if (payload.workerType !== "docker") {
      throw new Error(
        `Invalid workerType: ${payload.workerType}. Expected 'docker' for CLI worker.`,
      );
    }

    console.log(`Starting ephemeral worker for job: ${payload.jobId}`);

    // Initialize worker with DockerPayload
    const worker = new ViberatorWorker(new ClankerAgentAuthLifecycleFactory());
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
      scm: payload.scm,
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
