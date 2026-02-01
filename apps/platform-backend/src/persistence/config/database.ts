import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import { Database } from "../types/database";

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
      database: process.env.DB_NAME || "viberglass_receiver",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
    };

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
