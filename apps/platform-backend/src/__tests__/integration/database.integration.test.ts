import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Kysely, sql } from 'kysely';
import { setupTestDatabase, teardownTestDatabase } from '../helpers';

interface TestTable {
  id: number;
  name: string;
  created_at: Date;
}

describe('Database Integration Tests', () => {
  let db: Kysely<any>;

  beforeAll(async () => {
    const testDb = await setupTestDatabase();
    db = testDb.db;

    // Create a test table
    await db.schema
      .createTable('test_table')
      .addColumn('id', 'serial', (col) => col.primaryKey())
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
      .execute();
  }, 30000);

  afterAll(async () => {
    await db.schema.dropTable('test_table').execute();
    await teardownTestDatabase();
  });

  describe('CRUD Operations', () => {
    it('should insert a record', async () => {
      const result = await db
        .insertInto('test_table')
        .values({ name: 'Test Record' })
        .returning('id')
        .execute();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBeDefined();
    });

    it('should select records', async () => {
      await db
        .insertInto('test_table')
        .values({ name: 'Another Test' })
        .execute();

      const results = await db
        .selectFrom('test_table')
        .selectAll()
        .execute();

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('name');
    });

    it('should update a record', async () => {
      const inserted = await db
        .insertInto('test_table')
        .values({ name: 'Update Test' })
        .returning('id')
        .execute();

      await db
        .updateTable('test_table')
        .set({ name: 'Updated Name' })
        .where('id', '=', inserted[0].id)
        .execute();

      const updated = await db
        .selectFrom('test_table')
        .where('id', '=', inserted[0].id)
        .selectAll()
        .executeTakeFirst();

      expect(updated?.name).toBe('Updated Name');
    });

    it('should delete a record', async () => {
      const inserted = await db
        .insertInto('test_table')
        .values({ name: 'Delete Test' })
        .returning('id')
        .execute();

      await db
        .deleteFrom('test_table')
        .where('id', '=', inserted[0].id)
        .execute();

      const deleted = await db
        .selectFrom('test_table')
        .where('id', '=', inserted[0].id)
        .executeTakeFirst();

      expect(deleted).toBeUndefined();
    });
  });
});
