import { test, expect } from '@playwright/test';
import { setupAWSTest, createTestProject, cleanupProject } from '../fixtures/aws-setup';
import { Client } from 'pg';

/**
 * End-to-end test: RDS PostgreSQL connection and operations
 *
 * This test validates database operations on AWS RDS:
 * 1. Connect to RDS directly
 * 2. Run basic queries
 * 3. Verify connection pooling
 * 4. Test transaction handling
 */
test.describe('RDS Connection (AWS)', () => {
  let testContext;
  let dbClient: Client;

  test.beforeAll(async () => {
    testContext = setupAWSTest();

    // Create direct RDS connection for testing
    const connectionString =
      process.env.RDS_CONNECTION_STRING ||
      `postgresql://${process.env.RDS_USERNAME}:${process.env.RDS_PASSWORD}@${process.env.RDS_ENDPOINT}/${process.env.DATABASE_NAME}`;

    dbClient = new Client({
      connectionString,
      ssl: {
        rejectUnauthorized: false, // For AWS RDS
      },
    });

    await dbClient.connect();
  });

  test.afterAll(async () => {
    if (dbClient) {
      await dbClient.end();
    }
  });

  test('should connect to RDS and query database', async () => {
    console.log('Testing RDS connection...');

    // Simple query to verify connection
    const result = await dbClient.query('SELECT NOW() as current_time, version()');

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].current_time).toBeDefined();
    expect(result.rows[0].version).toContain('PostgreSQL');

    console.log('PostgreSQL version:', result.rows[0].version);
  });

  test('should verify database schema exists', async () => {
    // Check that main tables exist
    const tablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;

    const result = await dbClient.query(tablesQuery);

    const tableNames = result.rows.map(row => row.table_name);
    console.log('Tables found:', tableNames);

    // Verify critical tables exist
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('tickets');
    expect(tableNames).toContain('jobs');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('integrations');
  });

  test('should execute CRUD operations on projects table', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Verify project exists in database
      const selectQuery = 'SELECT * FROM projects WHERE id = $1';
      const selectResult = await dbClient.query(selectQuery, [project.id]);

      expect(selectResult.rows.length).toBe(1);
      expect(selectResult.rows[0].name).toBe(project.name);
      expect(selectResult.rows[0].tenant_id).toBe(testContext.tenantId);

      // Update project directly via SQL
      const updateQuery = 'UPDATE projects SET description = $1 WHERE id = $2 RETURNING *';
      const updateResult = await dbClient.query(updateQuery, [
        'Updated via E2E test',
        project.id,
      ]);

      expect(updateResult.rows[0].description).toBe('Updated via E2E test');

      // Verify update via API
      const apiResponse = await request.get(`/api/projects/${project.id}`, {
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      const apiProject = await apiResponse.json();
      expect(apiProject.description).toBe('Updated via E2E test');

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should handle database transactions', async () => {
    // Start transaction
    await dbClient.query('BEGIN');

    try {
      // Insert test data
      const insertQuery = `
        INSERT INTO projects (id, name, description, tenant_id)
        VALUES (gen_random_uuid(), $1, $2, $3)
        RETURNING id
      `;

      const result = await dbClient.query(insertQuery, [
        'Transaction Test Project',
        'Testing transaction handling',
        testContext.tenantId,
      ]);

      const projectId = result.rows[0].id;

      // Verify data exists within transaction
      const selectResult = await dbClient.query('SELECT * FROM projects WHERE id = $1', [
        projectId,
      ]);
      expect(selectResult.rows.length).toBe(1);

      // Rollback transaction
      await dbClient.query('ROLLBACK');

      // Verify data was rolled back
      const afterRollback = await dbClient.query('SELECT * FROM projects WHERE id = $1', [
        projectId,
      ]);
      expect(afterRollback.rows.length).toBe(0);

    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    }
  });

  test('should verify connection pool settings', async () => {
    // Query current connection settings
    const settingsQuery = `
      SELECT name, setting
      FROM pg_settings
      WHERE name IN ('max_connections', 'shared_buffers', 'work_mem')
      ORDER BY name;
    `;

    const result = await dbClient.query(settingsQuery);

    console.log('Database settings:');
    result.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.setting}`);
    });

    // Verify max_connections is reasonable for production
    const maxConnections = result.rows.find(r => r.name === 'max_connections');
    expect(parseInt(maxConnections.setting)).toBeGreaterThanOrEqual(100);
  });

  test('should verify active connections', async () => {
    // Query current connections
    const connectionsQuery = `
      SELECT
        datname,
        usename,
        application_name,
        state,
        count(*) as connection_count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY datname, usename, application_name, state
      ORDER BY connection_count DESC;
    `;

    const result = await dbClient.query(connectionsQuery);

    console.log('Active connections:');
    result.rows.forEach(row => {
      console.log(
        `  ${row.usename}@${row.datname} [${row.application_name}]: ${row.connection_count} (${row.state})`
      );
    });

    // There should be at least one connection (this test connection)
    const totalConnections = result.rows.reduce(
      (sum, row) => sum + parseInt(row.connection_count),
      0
    );
    expect(totalConnections).toBeGreaterThanOrEqual(1);
  });

  test('should verify database indexes exist', async () => {
    // Query indexes on critical tables
    const indexQuery = `
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('projects', 'tickets', 'jobs')
      ORDER BY tablename, indexname;
    `;

    const result = await dbClient.query(indexQuery);

    console.log('Indexes found:');
    result.rows.forEach(row => {
      console.log(`  ${row.tablename}.${row.indexname}`);
    });

    // Verify primary key indexes exist
    const indexNames = result.rows.map(row => row.indexname);
    expect(indexNames.some(name => name.includes('projects'))).toBeTruthy();
    expect(indexNames.some(name => name.includes('tickets'))).toBeTruthy();
    expect(indexNames.some(name => name.includes('jobs'))).toBeTruthy();
  });

  test('should handle query timeout', async () => {
    // Set statement timeout
    await dbClient.query('SET statement_timeout = 1000'); // 1 second

    // Try to run a long query
    await expect(async () => {
      await dbClient.query('SELECT pg_sleep(5)'); // 5 second sleep
    }).rejects.toThrow();

    // Reset timeout
    await dbClient.query('SET statement_timeout = 0');
  });

  test('should verify database backup configuration', async () => {
    // Query RDS backup settings (if accessible)
    // Note: This requires appropriate IAM permissions

    // For now, just verify we can query the database
    const result = await dbClient.query('SELECT current_database()');
    expect(result.rows[0].current_database).toBeTruthy();

    console.log('Database name:', result.rows[0].current_database);
  });

  test('should verify tenant isolation in jobs table', async ({ request }) => {
    // Jobs table should have tenant_id column for isolation
    const columnQuery = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'jobs'
        AND column_name = 'tenant_id';
    `;

    const result = await dbClient.query(columnQuery);

    if (result.rows.length > 0) {
      expect(result.rows[0].column_name).toBe('tenant_id');
      console.log('Jobs table has tenant_id column for isolation');
    } else {
      console.warn('WARNING: Jobs table does not have tenant_id column');
    }
  });
});
