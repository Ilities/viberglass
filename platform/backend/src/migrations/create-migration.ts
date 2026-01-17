import * as path from 'path';
import { promises as fs } from 'fs';

async function createMigration() {
  const migrationName = process.argv[2];

  if (!migrationName) {
    console.error('❌ Please provide a migration name');
    console.log('Usage: npm run migrate:create <migration-name>');
    process.exit(1);
  }

  const timestamp = new Date().getTime();
  const filename = `${timestamp}_${migrationName}.ts`;
  const migrationPath = path.join(__dirname, filename);

  const template = `import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Write your migration here
}

export async function down(db: Kysely<any>): Promise<void> {
  // Write your rollback here
}
`;

  await fs.writeFile(migrationPath, template);
  console.log(`✅ Created migration: ${filename}`);
}

createMigration();
