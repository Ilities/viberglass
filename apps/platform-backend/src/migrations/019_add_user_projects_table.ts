import { Kysely, sql } from "kysely";

/**
 * Migration: Add user_projects junction table
 *
 * This table establishes many-to-many relationship between users and projects,
 * enabling project-level access control and tenant isolation.
 *
 * Security Impact: Critical for multi-tenant isolation
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Create user_projects junction table
  await db.schema
    .createTable("user_projects")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("project_id", "uuid", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("role", "varchar(50)", (col) =>
      col.notNull().defaultTo("member"),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Unique constraint: user can only be added to a project once
  await db.schema
    .createIndex("idx_user_projects_unique")
    .on("user_projects")
    .columns(["user_id", "project_id"])
    .unique()
    .execute();

  // Index for efficient project membership lookups
  await db.schema
    .createIndex("idx_user_projects_user_id")
    .on("user_projects")
    .column("user_id")
    .execute();

  // Index for efficient user lookups by project
  await db.schema
    .createIndex("idx_user_projects_project_id")
    .on("user_projects")
    .column("project_id")
    .execute();

  // Migrate existing data: Link all users to all projects
  // This maintains current behavior where users have access to all projects
  console.log("Migrating existing users to projects...");

  await sql`
    INSERT INTO user_projects (id, user_id, project_id, role, created_at)
    SELECT
      gen_random_uuid() as id,
      u.id as user_id,
      p.id as project_id,
      CASE
        WHEN u.role = 'admin' THEN 'admin'
        ELSE 'member'
      END as role,
      CURRENT_TIMESTAMP as created_at
    FROM users u
    CROSS JOIN projects p
    ON CONFLICT (user_id, project_id) DO NOTHING
  `.execute(db);

  console.log("User-project associations migrated successfully");
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex("idx_user_projects_project_id").execute();
  await db.schema.dropIndex("idx_user_projects_user_id").execute();
  await db.schema.dropIndex("idx_user_projects_unique").execute();

  // Drop table
  await db.schema.dropTable("user_projects").execute();
}
