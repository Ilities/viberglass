import db from "../config/database";

export interface IntegrationUser {
  projectId: string;
  projectName: string;
}

/** Projects that depend on an integration, through a link or their repository settings. */
export class IntegrationUsageDAO {
  async listProjectsUsing(integrationId: string): Promise<IntegrationUser[]> {
    const rows = await db
      .selectFrom("projects")
      .select(["projects.id", "projects.name"])
      .where((eb) =>
        eb.or([
          eb(
            "projects.id",
            "in",
            eb
              .selectFrom("project_integrations")
              .select("project_integrations.project_id")
              .where("project_integrations.integration_id", "=", integrationId),
          ),
          eb(
            "projects.id",
            "in",
            eb
              .selectFrom("project_scm_configs")
              .select("project_scm_configs.project_id")
              .where("project_scm_configs.integration_id", "=", integrationId),
          ),
        ]),
      )
      .orderBy("projects.name")
      .execute();

    return rows.map((row) => ({ projectId: row.id, projectName: row.name }));
  }
}
