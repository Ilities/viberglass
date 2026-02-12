import * as dotenv from "dotenv";

dotenv.config();

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
