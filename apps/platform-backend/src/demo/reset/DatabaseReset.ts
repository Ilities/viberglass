import type { PoolClient } from "pg";

/** Empties the database by dropping and recreating its public schema; the migrations build it again. */
export class DatabaseReset {
  constructor(private readonly db: Pick<PoolClient, "query">) {}

  async run(): Promise<void> {
    // A backend pod still shutting down could hold locks the drop waits on.
    await this.db.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND usename = current_user AND pid <> pg_backend_pid()");
    await this.db.query("DROP SCHEMA IF EXISTS public CASCADE");
    await this.db.query("CREATE SCHEMA public");
  }
}
