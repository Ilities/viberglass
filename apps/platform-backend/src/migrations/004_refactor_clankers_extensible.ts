import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Create deployment_strategies table - defines available deployment types
  await db.schema
    .createTable("deployment_strategies")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "varchar(50)", (col) => col.notNull().unique())
    .addColumn("description", "text")
    .addColumn("config_schema", "jsonb") // Optional JSON schema for validation
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Insert default deployment strategies
  await db
    .insertInto("deployment_strategies")
    .values([
      {
        id: sql`gen_random_uuid()`,
        name: "docker",
        description: "Deploy as a Docker container",
        config_schema: JSON.stringify({
          type: "object",
          properties: {
            containerImage: { type: "string" },
            ports: { type: "object" },
            environmentVariables: { type: "object" },
          },
          required: ["containerImage"],
        }),
      },
      {
        id: sql`gen_random_uuid()`,
        name: "ecs",
        description: "Deploy to AWS Elastic Container Service",
        config_schema: JSON.stringify({
          type: "object",
          properties: {
            clusterArn: { type: "string" },
            taskDefinitionArn: { type: "string" },
            subnetIds: { type: "array", items: { type: "string" } },
            securityGroupIds: { type: "array", items: { type: "string" } },
          },
          required: ["clusterArn", "taskDefinitionArn"],
        }),
      },
      {
        id: sql`gen_random_uuid()`,
        name: "aws-lambda-container",
        description: "Deploy as an AWS Lambda container image",
        config_schema: JSON.stringify({
          type: "object",
          properties: {
            imageUri: { type: "string" },
            memorySize: { type: "integer", minimum: 128, maximum: 10240 },
            timeout: { type: "integer", minimum: 1, maximum: 900 },
            environment: { type: "object" },
            roleArn: { type: "string" },
            architecture: { type: "string", enum: ["x86_64", "arm64"] },
            vpc: {
              type: "object",
              properties: {
                subnetIds: { type: "array", items: { type: "string" } },
                securityGroupIds: { type: "array", items: { type: "string" } },
              },
            },
          },
          required: ["imageUri"],
        }),
      },
    ])
    .execute();

  // Create clanker_config_files table - extensible config file storage
  await db.schema
    .createTable("clanker_config_files")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("clanker_id", "uuid", (col) =>
      col.notNull().references("clankers.id").onDelete("cascade"),
    )
    .addColumn("file_type", "varchar(100)", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Unique constraint: one file type per clanker
  await db.schema
    .createIndex("idx_clanker_config_files_unique")
    .on("clanker_config_files")
    .columns(["clanker_id", "file_type"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_clanker_config_files_clanker_id")
    .on("clanker_config_files")
    .column("clanker_id")
    .execute();

  // Create trigger for updated_at on clanker_config_files
  await sql`CREATE TRIGGER update_clanker_config_files_updated_at BEFORE UPDATE ON clanker_config_files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(
    db,
  );

  // Migrate existing clanker data to new structure
  // First, get deployment strategy IDs
  const dockerStrategy = await db
    .selectFrom("deployment_strategies")
    .select("id")
    .where("name", "=", "docker")
    .executeTakeFirst();

  const ecsStrategy = await db
    .selectFrom("deployment_strategies")
    .select("id")
    .where("name", "=", "ecs")
    .executeTakeFirst();

  // Migrate config files from existing clankers
  const existingClankers = await db
    .selectFrom("clankers")
    .select([
      "id",
      "claude_md",
      "agents_md",
      "skills_md",
      "deployment_type",
      "docker_config",
      "ecs_config",
    ])
    .execute();

  for (const clanker of existingClankers) {
    // Migrate config files
    if (clanker.claude_md) {
      await db
        .insertInto("clanker_config_files")
        .values({
          id: sql`gen_random_uuid()`,
          clanker_id: clanker.id,
          file_type: "claude.md",
          content: clanker.claude_md,
        })
        .execute();
    }
    if (clanker.agents_md) {
      await db
        .insertInto("clanker_config_files")
        .values({
          id: sql`gen_random_uuid()`,
          clanker_id: clanker.id,
          file_type: "agents.md",
          content: clanker.agents_md,
        })
        .execute();
    }
    if (clanker.skills_md) {
      await db
        .insertInto("clanker_config_files")
        .values({
          id: sql`gen_random_uuid()`,
          clanker_id: clanker.id,
          file_type: "skills.md",
          content: clanker.skills_md,
        })
        .execute();
    }
  }

  // Add new columns to clankers
  await db.schema
    .alterTable("clankers")
    .addColumn("deployment_strategy_id", "uuid", (col) =>
      col.references("deployment_strategies.id"),
    )
    .execute();

  await db.schema
    .alterTable("clankers")
    .addColumn("deployment_config", "jsonb")
    .execute();

  // Migrate deployment data
  for (const clanker of existingClankers) {
    const strategyId =
      clanker.deployment_type === "docker"
        ? dockerStrategy?.id
        : ecsStrategy?.id;
    const config =
      clanker.deployment_type === "docker"
        ? clanker.docker_config
        : clanker.ecs_config;

    if (strategyId) {
      await db
        .updateTable("clankers")
        .set({
          deployment_strategy_id: strategyId,
          deployment_config: config,
        })
        .where("id", "=", clanker.id)
        .execute();
    }
  }

  // Drop old columns from clankers
  await db.schema.alterTable("clankers").dropColumn("claude_md").execute();
  await db.schema.alterTable("clankers").dropColumn("agents_md").execute();
  await db.schema.alterTable("clankers").dropColumn("skills_md").execute();
  await db.schema
    .alterTable("clankers")
    .dropColumn("deployment_type")
    .execute();
  await db.schema.alterTable("clankers").dropColumn("docker_config").execute();
  await db.schema.alterTable("clankers").dropColumn("ecs_config").execute();

  // Add index for deployment_strategy_id
  await db.schema
    .createIndex("idx_clankers_deployment_strategy_id")
    .on("clankers")
    .column("deployment_strategy_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Add back old columns
  await db.schema
    .alterTable("clankers")
    .addColumn("claude_md", "text")
    .execute();
  await db.schema
    .alterTable("clankers")
    .addColumn("agents_md", "text")
    .execute();
  await db.schema
    .alterTable("clankers")
    .addColumn("skills_md", "text")
    .execute();
  await db.schema
    .alterTable("clankers")
    .addColumn("deployment_type", "varchar(20)")
    .execute();
  await db.schema
    .alterTable("clankers")
    .addColumn("docker_config", "jsonb")
    .execute();
  await db.schema
    .alterTable("clankers")
    .addColumn("ecs_config", "jsonb")
    .execute();

  // Migrate data back (best effort)
  const clankers = await db
    .selectFrom("clankers")
    .innerJoin(
      "deployment_strategies",
      "deployment_strategies.id",
      "clankers.deployment_strategy_id",
    )
    .select([
      "clankers.id",
      "deployment_strategies.name as strategy_name",
      "clankers.deployment_config",
    ])
    .execute();

  for (const clanker of clankers) {
    const configFiles = await db
      .selectFrom("clanker_config_files")
      .select(["file_type", "content"])
      .where("clanker_id", "=", clanker.id)
      .execute();

    const claudeMd = configFiles.find(
      (f) => f.file_type === "claude.md",
    )?.content;
    const agentsMd = configFiles.find(
      (f) => f.file_type === "agents.md",
    )?.content;
    const skillsMd = configFiles.find(
      (f) => f.file_type === "skills.md",
    )?.content;

    await db
      .updateTable("clankers")
      .set({
        claude_md: claudeMd || null,
        agents_md: agentsMd || null,
        skills_md: skillsMd || null,
        deployment_type: clanker.strategy_name,
        docker_config:
          clanker.strategy_name === "docker" ? clanker.deployment_config : null,
        ecs_config:
          clanker.strategy_name === "ecs" ? clanker.deployment_config : null,
      })
      .where("id", "=", clanker.id)
      .execute();
  }

  // Drop new columns
  await db.schema.dropIndex("idx_clankers_deployment_strategy_id").execute();
  await db.schema
    .alterTable("clankers")
    .dropColumn("deployment_strategy_id")
    .execute();
  await db.schema
    .alterTable("clankers")
    .dropColumn("deployment_config")
    .execute();

  // Re-add deployment_type index
  await db.schema
    .createIndex("idx_clankers_deployment_type")
    .on("clankers")
    .column("deployment_type")
    .execute();

  // Drop config files table
  await sql`DROP TRIGGER IF EXISTS update_clanker_config_files_updated_at ON clanker_config_files;`.execute(
    db,
  );
  await db.schema.dropTable("clanker_config_files").execute();

  // Drop deployment strategies table
  await db.schema.dropTable("deployment_strategies").execute();
}
