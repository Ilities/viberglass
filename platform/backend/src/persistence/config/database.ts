import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import { Database } from "../types/database";

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "viberglass_receiver",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
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
