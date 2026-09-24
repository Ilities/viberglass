import { ChildProcess, execFileSync, spawn } from "child_process";
import { mkdirSync, openSync } from "fs";
import { fileURLToPath } from "url";
import { backendEnvironment, E2E } from "./e2eEnvironment";

const BACKEND_DIR = fileURLToPath(new URL("../../../apps/platform-backend", import.meta.url));
const POSTGRES_CONTAINER = "viberglass-e2e-first-run-postgres";
/** The backend's output, for when the journey fails. */
const BACKEND_LOG = fileURLToPath(new URL("../test-results/first-run-backend.log", import.meta.url));

/**
 * A second backend on an empty database, for the first-run setup journey: the
 * suite's own workspace is seeded, and setup only starts on a fresh one. Its
 * GitHub API and test model provider point at the setup stub.
 */
export class FirstRunScenario {
  private backend?: ChildProcess;

  readonly backendUrl = `http://localhost:${E2E.firstRunBackendPort}`;

  constructor(private readonly stubUrl: string) {}

  async start(): Promise<void> {
    execFileSync("docker", [
      "run", "--detach", "--rm",
      "--name", POSTGRES_CONTAINER,
      "--publish", `${E2E.firstRunPostgresPort}:5432`,
      "--tmpfs", "/var/lib/postgresql/data",
      "--env", "POSTGRES_DB=viberglass-e2e",
      "--env", "POSTGRES_USER=viberglass",
      "--env", "POSTGRES_PASSWORD=viberglass",
      "postgres:16-alpine",
    ], { stdio: "ignore" });

    mkdirSync(fileURLToPath(new URL("../test-results", import.meta.url)), { recursive: true });
    const log = openSync(BACKEND_LOG, "w");
    this.backend = spawn("npx", ["tsx", "src/api/server.ts"], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        ...backendEnvironment({ port: E2E.firstRunBackendPort, postgresPort: E2E.firstRunPostgresPort }),
        GITHUB_API_URL: this.stubUrl,
        VIBERGLASS_FAKE_PROVIDER_URL: this.stubUrl,
        LOG_LEVEL: "info",
      },
      stdio: ["ignore", log, log],
    });

    const deadline = Date.now() + 90_000;
    while (!(await this.isServing())) {
      if (Date.now() > deadline) throw new Error("The first-run backend didn't start");
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  private async isServing(): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/api/auth/setup-status`);
      return response.ok;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.backend?.kill();
    try {
      execFileSync("docker", ["rm", "--force", POSTGRES_CONTAINER], { stdio: "ignore" });
    } catch {
      // Not started.
    }
  }
}
