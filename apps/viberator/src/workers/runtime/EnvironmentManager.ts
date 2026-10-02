import { Logger } from "winston";
import { AGENT_ENV_PASSTHROUGH_VAR } from "@viberglass/agent-core";

export class EnvironmentManager {
  constructor(private readonly logger: Logger) {}

  inject(
    credentials: Record<string, string | undefined>,
    environment?: Record<string, string>,
  ): void {
    for (const [envVar, value] of Object.entries(credentials)) {
      if (value !== undefined) {
        process.env[envVar] = value;
        this.logger.debug("Injected credential into environment", { envVar });
      }
    }

    if (!environment) {
      return;
    }

    for (const [key, value] of Object.entries(environment)) {
      process.env[key] = value;
      this.logger.debug("Injected clanker config environment variable", {
        key,
      });
    }

    // Agent CLIs get a deny-by-default environment (see sanitizeAgentEnvironment).
    // Clanker-config variables are operator-declared and meant for the agent, so
    // name them explicitly as passthrough — still subject to the denylist.
    const declared = Object.keys(environment);
    if (declared.length > 0) {
      process.env[AGENT_ENV_PASSTHROUGH_VAR] = declared.join(",");
    }
  }

  cleanup(
    credentials: Record<string, string | undefined>,
    environment?: Record<string, string>,
  ): void {
    for (const [envVar, value] of Object.entries(credentials)) {
      if (value !== undefined) {
        delete process.env[envVar];
        this.logger.debug("Cleaned up credential from environment", { envVar });
      }
    }

    if (!environment) {
      return;
    }

    for (const key of Object.keys(environment)) {
      delete process.env[key];
      this.logger.debug("Cleaned up clanker config environment variable", {
        key,
      });
    }

    delete process.env[AGENT_ENV_PASSTHROUGH_VAR];
  }
}
