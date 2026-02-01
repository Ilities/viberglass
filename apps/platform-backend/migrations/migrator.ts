import * as path from "path";
import { promises as fs } from "fs";
import {
  Kysely,
  Migrator,
  PostgresDialect,
  FileMigrationProvider,
} from "kysely";
import { Pool } from "pg";
import * as dotenv from "dotenv";

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

async function migrateToLatest() {
  const db = new Kysely<any>({
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

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(
        `✅ Migration "${it.migrationName}" was executed successfully`,
      );
    } else if (it.status === "Error") {
      console.error(`❌ Failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("❌ Failed to migrate");
    console.error(error);
    process.exit(1);
  }

  await db.destroy();
  console.log("✅ All migrations completed successfully");
}

migrateToLatest();
