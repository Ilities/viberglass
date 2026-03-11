import { readFileSync } from "fs";
import { join } from "path";

/**
 * Loads .env.e2e (if present) into process.env before playwright starts the
 * webServer processes, so the backend picks up the test database config.
 *
 * Falls back to docker-compose fixed ports when the file doesn't exist.
 */
export default async function globalSetup() {
  // Defaults matching docker/docker-compose.e2e.yaml fixed ports
  const defaults: Record<string, string> = {
    DB_HOST: "localhost",
    DB_PORT: "5433",
    DB_NAME: "viberator",
    DB_USER: "viberator",
    DB_PASSWORD: "viberator",
    AWS_ENDPOINT_URL: "http://localhost:4566",
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_REGION: "eu-west-1",
    NODE_ENV: "test",
    AUTH_ENABLED: "false",
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  // Override with .env.e2e if present (written by setup:services testcontainers run)
  const envFile = join(process.cwd(), ".env.e2e");
  try {
    const content = readFileSync(envFile, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const value = trimmed.slice(eqIdx + 1);
      process.env[key] = value;
    }
    console.log("E2E: Loaded .env.e2e");
  } catch {
    console.log("E2E: No .env.e2e found, using docker-compose defaults");
  }
}
