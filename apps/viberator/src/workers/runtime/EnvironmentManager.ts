import { Logger } from "winston";

export class EnvironmentManager {
  constructor(private readonly logger: Logger) {}

  inject(
    credentials: Record<string, string | undefined>,
    environment?: Record<string, string>,
  ): void {
    for (const [key, value] of Object.entries(credentials)) {
      if (value !== undefined) {
        const envKey = this.keyToEnvVar(key);
        process.env[envKey] = value;
        this.logger.debug("Injected credential into environment", { envKey });
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
  }

  cleanup(
    credentials: Record<string, string | undefined>,
    environment?: Record<string, string>,
  ): void {
    for (const [key, value] of Object.entries(credentials)) {
      if (value !== undefined) {
        const envKey = this.keyToEnvVar(key);
        delete process.env[envKey];
        this.logger.debug("Cleaned up credential from environment", { envKey });
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
  }

  private keyToEnvVar(key: string): string {
    return key.toUpperCase().replace(/-/g, "_");
  }
}
