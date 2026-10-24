import * as dotenv from "dotenv";
import { reportMissingRequiredEnv, validateRequiredEnv } from "./requiredEnv";

dotenv.config();

// At import, because database.ts and migrator.ts read the environment while they
// are being evaluated, before the entrypoint's body runs.
const missing = validateRequiredEnv(process.env);
if (missing.length > 0) {
  reportMissingRequiredEnv(missing);
  process.exit(1);
}

/**
 * Environment variable configuration
 */
export const env = {
  /**
   * Whether to run database migrations on application startup.
   * Set to "true" to enable. Default is "false" for safety.
   * 
   * This is enabled by default on ECS deployments via infrastructure configuration.
   */
  RUN_MIGRATIONS_ON_STARTUP: process.env.RUN_MIGRATIONS_ON_STARTUP === "true",
};
