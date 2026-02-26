import type {
  ProjectScmConfig,
  UpsertProjectScmConfigRequest,
} from "@viberglass/types";
import db from "../config/database";

type ProjectScmConfigRow = {
  id: string;
  project_id: string;
  integration_id: string;
  source_repository: string;
  base_branch: string;
  pr_repository: string | null;
  pr_base_branch: string | null;
  branch_name_template: string | null;
  integration_credential_id: string | null;
  created_at: Date;
  updated_at: Date;
  integration_system?: string;
};

export class ProjectScmConfigDAO {
  async getByProjectId(projectId: string): Promise<ProjectScmConfig | null> {
    const row = await db
      .selectFrom("project_scm_configs")
      .leftJoin("integrations", "integrations.id", "project_scm_configs.integration_id")
      .select([
        "project_scm_configs.id",
        "project_scm_configs.project_id",
        "project_scm_configs.integration_id",
        "project_scm_configs.source_repository",
        "project_scm_configs.base_branch",
        "project_scm_configs.pr_repository",
        "project_scm_configs.pr_base_branch",
        "project_scm_configs.branch_name_template",
        "project_scm_configs.integration_credential_id",
        "project_scm_configs.created_at",
        "project_scm_configs.updated_at",
        "integrations.system as integration_system",
      ])
      .where("project_scm_configs.project_id", "=", projectId)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row as ProjectScmConfigRow);
  }

  async upsertByProjectId(
    projectId: string,
    input: UpsertProjectScmConfigRequest,
  ): Promise<ProjectScmConfig> {
    const timestamp = new Date();

    const existing = await db
      .selectFrom("project_scm_configs")
      .select("id")
      .where("project_id", "=", projectId)
      .executeTakeFirst();

    if (existing) {
      const updated = await db
        .updateTable("project_scm_configs")
        .set({
          integration_id: input.integrationId,
          source_repository: input.sourceRepository,
          base_branch: input.baseBranch || "main",
          pr_repository: input.pullRequestRepository ?? null,
          pr_base_branch: input.pullRequestBaseBranch ?? null,
          branch_name_template: input.branchNameTemplate ?? null,
          integration_credential_id: input.integrationCredentialId ?? null,
          updated_at: timestamp,
        })
        .where("project_id", "=", projectId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapRow(updated as ProjectScmConfigRow);
    }

    const created = await db
      .insertInto("project_scm_configs")
      .values({
        project_id: projectId,
        integration_id: input.integrationId,
        source_repository: input.sourceRepository,
        base_branch: input.baseBranch || "main",
        pr_repository: input.pullRequestRepository ?? null,
        pr_base_branch: input.pullRequestBaseBranch ?? null,
        branch_name_template: input.branchNameTemplate ?? null,
        integration_credential_id: input.integrationCredentialId ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(created as ProjectScmConfigRow);
  }

  async deleteByProjectId(projectId: string): Promise<boolean> {
    const result = await db
      .deleteFrom("project_scm_configs")
      .where("project_id", "=", projectId)
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0) > 0;
  }

  private mapRow(row: ProjectScmConfigRow): ProjectScmConfig {
    return {
      projectId: row.project_id,
      integrationId: row.integration_id,
      integrationSystem: row.integration_system as ProjectScmConfig["integrationSystem"],
      sourceRepository: row.source_repository,
      baseBranch: row.base_branch,
      pullRequestRepository: row.pr_repository,
      pullRequestBaseBranch: row.pr_base_branch,
      branchNameTemplate: row.branch_name_template,
      integrationCredentialId: row.integration_credential_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
