import { ChildProcess, execFileSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import { backendEnvironment, E2E } from "./e2eEnvironment";

const BACKEND_DIR = fileURLToPath(new URL("../../../apps/platform-backend", import.meta.url));
const POSTGRES_CONTAINER = "viberglass-e2e-late-postgres";

/**
 * A second backend whose database only appears after the backend has started,
 * like a stack restart where Postgres is slow. Separate from the suite's
 * backend so the other journeys keep their data.
 */
export class LateDatabaseScenario {
  private backend?: ChildProcess;

  readonly backendUrl = `http://localhost:${E2E.lateBackendPort}`;

  startBackend(): void {
    this.backend = spawn("npx", ["tsx", "src/api/server.ts"], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        ...backendEnvironment({ port: E2E.lateBackendPort, postgresPort: E2E.latePostgresPort }),
      },
      stdio: "ignore",
    });
  }

  startDatabase(): void {
    execFileSync("docker", [
      "run", "--detach", "--rm",
      "--name", POSTGRES_CONTAINER,
      "--publish", `${E2E.latePostgresPort}:5432`,
      "--tmpfs", "/var/lib/postgresql/data",
      "--env", "POSTGRES_DB=viberglass-e2e",
      "--env", "POSTGRES_USER=viberglass",
      "--env", "POSTGRES_PASSWORD=viberglass",
      "postgres:16-alpine",
    ], { stdio: "ignore" });
  }

  /** Whether the backend answers at all; false while it is still waiting. */
  async isServing(): Promise<boolean> {
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
