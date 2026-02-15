import * as path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  Kysely,
  Migrator,
  PostgresDialect,
  FileMigrationProvider,
} from "kysely";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import logger from "../config/logger";

dotenv.config();

/**
 * Parse DATABASE_URL connection string into connection config
 * Format: postgresql://username:password@hostname:port/database
 */
function parseDatabaseUrl(url: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  try {
    // Remove protocol prefix
    const withoutProtocol = url.replace(/^postgresql:\/\//, "");
    
    // Split auth part from host part
    const [authPart, hostPart] = withoutProtocol.split("@");
    
    if (!authPart || !hostPart) {
      throw new Error("Invalid DATABASE_URL format: missing @ separator");
    }
    
    // Parse credentials
    const [user, password] = authPart.split(":");
    
    // Parse host, port, and database
    const [hostAndPort, database] = hostPart.split("/");
    const [host, portStr] = hostAndPort.split(":");
    
    return {
      host: host || "localhost",
      port: parseInt(portStr || "5432"),
      database: database || "viberglass",
      user: user || "postgres",
      password: password || "",
    };
  } catch (error) {
    console.error("Failed to parse DATABASE_URL:", error);
    throw new Error("Invalid DATABASE_URL format");
  }
}

// Determine connection config from environment
const dbConfig = process.env.DATABASE_URL
  ? parseDatabaseUrl(process.env.DATABASE_URL)
  : {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432"),
      database: process.env.DB_NAME || "viberglass-platform",
      user: process.env.DB_USER || "jussi",
      password: process.env.DB_PASSWORD || "salasana",
    };

/**
 * Creates a database connection for migrations
 */
function createMigrationDb() {
  return new Kysely<any>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        password: dbConfig.password,
        ssl:
          process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      }),
    }),
  });
}

/**
 * Runs database migrations to the latest version.
 * This can be called during application startup when RUN_MIGRATIONS_ON_STARTUP is enabled.
 * 
 * @returns Promise that resolves when migrations are complete
 * @throws Error if migrations fail
 */
export async function migrateToLatest(): Promise<void> {
  const db = createMigrationDb();

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      // Use compiled migrations in dist folder (migrations are compiled to JS)
      migrationFolder: path.join(__dirname),
    }),
  });

  logger.info("Starting database migrations...");

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      logger.info(`Migration "${it.migrationName}" executed successfully`);
    } else if (it.status === "Error") {
      logger.error(`Failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    logger.error("Database migration failed", { error });
    await db.destroy();
    throw error;
  }

  await db.destroy();
  logger.info("All database migrations completed successfully");
}

/**
 * CLI entry point for running migrations standalone.
 * Usage: npx ts-node migrations/migrator.ts
 */
async function main() {
  try {
    await migrateToLatest();
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

// Run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
