#!/usr/bin/env node

/**
 * Provision test data in AWS staging environment
 *
 * This script creates:
 * - Test user account
 * - Test project
 * - Test integration configurations
 * - Sample tickets
 */

import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.aws-test') });

interface ProvisionResult {
  userId: string;
  projectId: string;
  integrationId?: string;
  ticketIds: string[];
}

async function provisionTestData(): Promise<ProvisionResult> {
  const connectionString =
    process.env.RDS_CONNECTION_STRING ||
    `postgresql://${process.env.RDS_USERNAME}:${process.env.RDS_PASSWORD}@${process.env.RDS_ENDPOINT}/${process.env.DATABASE_NAME}`;

  const tenantId = process.env.TEST_TENANT_ID || 'staging-e2e-test';

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    console.log('🚀 Provisioning test data in staging environment...\n');

    // 1. Create test user
    console.log('1️⃣  Creating test user...');
    const userResult = await client.query(
      `
      INSERT INTO users (id, email, name, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
      [
        uuidv4(),
        'e2e-test@viberglass.dev',
        'E2E Test User',
        tenantId,
      ]
    );
    const userId = userResult.rows[0].id;
    console.log(`   ✅ User created: ${userId}\n`);

    // 2. Create test project
    console.log('2️⃣  Creating test project...');
    const projectResult = await client.query(
      `
      INSERT INTO projects (id, name, description, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `,
      [
        uuidv4(),
        'E2E Test Project',
        'Automated test project for E2E testing',
        tenantId,
      ]
    );
    const projectId = projectResult.rows[0].id;
    console.log(`   ✅ Project created: ${projectId}\n`);

    // 3. Link user to project (if user_projects table exists)
    console.log('3️⃣  Linking user to project...');
    try {
      await client.query(
        `
        INSERT INTO user_projects (id, user_id, project_id, role, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, project_id) DO NOTHING
      `,
        [uuidv4(), userId, projectId, 'admin']
      );
      console.log('   ✅ User linked to project\n');
    } catch (error) {
      console.log('   ⚠️  user_projects table may not exist yet\n');
    }

    // 4. Create GitHub integration (if configured)
    let integrationId: string | undefined;
    if (process.env.GITHUB_TEST_REPO) {
      console.log('4️⃣  Creating GitHub integration...');
      const integrationResult = await client.query(
        `
        INSERT INTO integrations (id, project_id, type, configuration, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id
      `,
        [
          uuidv4(),
          projectId,
          'github',
          JSON.stringify({
            repository: process.env.GITHUB_TEST_REPO,
            token: process.env.GITHUB_TOKEN,
            webhook_secret: process.env.GITHUB_WEBHOOK_SECRET,
          }),
        ]
      );
      integrationId = integrationResult.rows[0].id;
      console.log(`   ✅ Integration created: ${integrationId}\n`);
    } else {
      console.log('4️⃣  Skipping GitHub integration (not configured)\n');
    }

    // 5. Create sample tickets
    console.log('5️⃣  Creating sample tickets...');
    const ticketTitles = [
      'Implement user authentication',
      'Add password reset functionality',
      'Fix bug in login form validation',
      'Optimize database queries',
      'Add API rate limiting',
    ];

    const ticketIds: string[] = [];
    for (const title of ticketTitles) {
      const ticketResult = await client.query(
        `
        INSERT INTO tickets (id, project_id, title, description, severity, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `,
        [
          uuidv4(),
          projectId,
          title,
          `E2E test ticket: ${title}`,
          'medium',
          'open',
        ]
      );
      ticketIds.push(ticketResult.rows[0].id);
    }
    console.log(`   ✅ Created ${ticketIds.length} sample tickets\n`);

    console.log('✨ Test data provisioning complete!\n');
    console.log('📝 Summary:');
    console.log(`   Tenant ID: ${tenantId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Project ID: ${projectId}`);
    if (integrationId) {
      console.log(`   Integration ID: ${integrationId}`);
    }
    console.log(`   Ticket count: ${ticketIds.length}`);
    console.log('\n💡 Update your .env.aws-test file with these values\n');

    return {
      userId,
      projectId,
      integrationId,
      ticketIds,
    };
  } finally {
    await client.end();
  }
}

async function cleanupOldTestData(): Promise<void> {
  const connectionString =
    process.env.RDS_CONNECTION_STRING ||
    `postgresql://${process.env.RDS_USERNAME}:${process.env.RDS_PASSWORD}@${process.env.RDS_ENDPOINT}/${process.env.DATABASE_NAME}`;

  const tenantId = process.env.TEST_TENANT_ID || 'staging-e2e-test';

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    console.log('🧹 Cleaning up old test data (older than 7 days)...\n');

    // Delete old test projects
    const deleteResult = await client.query(
      `
      DELETE FROM projects
      WHERE tenant_id = $1
        AND name LIKE 'E2E Test%'
        AND created_at < NOW() - INTERVAL '7 days'
      RETURNING id
    `,
      [tenantId]
    );

    console.log(`   ✅ Deleted ${deleteResult.rowCount} old test projects\n`);

    // Delete old test users
    const userDeleteResult = await client.query(
      `
      DELETE FROM users
      WHERE email LIKE '%@test.viberglass.dev'
        AND created_at < NOW() - INTERVAL '7 days'
      RETURNING id
    `
    );

    console.log(`   ✅ Deleted ${userDeleteResult.rowCount} old test users\n`);

  } finally {
    await client.end();
  }
}

// Main execution
const command = process.argv[2];

if (command === 'cleanup') {
  cleanupOldTestData()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
} else {
  provisionTestData()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Provisioning failed:', error);
      process.exit(1);
    });
}
