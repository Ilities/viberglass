import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

interface Database {
  id: Generated<number>;
  name: string;
}

export class TestDatabase {
  private static container: StartedPostgreSqlContainer | null = null;
  private static db: Kysely<any> | null = null;

  static async start(): Promise<{ connectionString: string; db: Kysely<any> }> {
    if (this.container) {
      return {
        connectionString: this.container.getConnectionUri(),
        db: this.db!,
      };
    }

    this.container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('testdb')
      .withUsername('test')
      .withPassword('test')
      .start();

    const pool = new Pool({
      connectionString: this.container.getConnectionUri(),
    });

    this.db = new Kysely<any>({
      dialect: new PostgresDialect(pool),
    });

    return {
      connectionString: this.container.getConnectionUri(),
      db: this.db,
    };
  }

  static async stop(): Promise<void> {
    if (this.db) {
      await this.db.destroy();
      this.db = null;
    }
    if (this.container) {
      await this.container.stop();
      this.container = null;
    }
  }

  static getDb(): Kysely<any> | null {
    return this.db;
  }

  static getConnectionString(): string | null {
    return this.container?.getConnectionUri() ?? null;
  }
}

export async function setupTestDatabase(): Promise<{
  connectionString: string;
  db: Kysely<any>;
}> {
  return TestDatabase.start();
}

export async function teardownTestDatabase(): Promise<void> {
  await TestDatabase.stop();
}
