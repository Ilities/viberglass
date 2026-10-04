import { Kysely, PostgresDialect } from "kysely";
import { Pool, defaults, types } from "pg";
import * as dotenv from "dotenv";
import { Database } from "../types/database";

dotenv.config();

/**
 * Parse DATABASE_URL connection string into connection config.
 * Uses the URL API so percent-encoded credentials (e.g. a ":" inside a
 * generated password) are decoded correctly.
 */
function parseDatabaseUrl(url: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) {
      throw new Error("missing host");
    }

    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432"),
      database: decodeURIComponent(parsed.pathname.slice(1)) || "viberglass",
      user: decodeURIComponent(parsed.username) || "postgres",
      password: decodeURIComponent(parsed.password),
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
      database: process.env.DB_NAME || "viberglass_receiver",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
    };

/**
 * Columns typed `timestamp` (without time zone) hold UTC, as the triggers that
 * fill `updated_at` with the database's now() do. The process's own time zone
 * must not leak into what it writes or reads there.
 */
const TIMESTAMP_WITHOUT_TIME_ZONE = 1114;
defaults.parseInputDatesAsUTC = true;
types.setTypeParser(TIMESTAMP_WITHOUT_TIME_ZONE, (value) => new Date(`${value.replace(" ", "T")}Z`));

const pool = new Pool({
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: dbConfig.password,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool,
  }),
});

export default db;
export { pool };
