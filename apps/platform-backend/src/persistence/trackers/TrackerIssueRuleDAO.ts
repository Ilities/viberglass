import db from "../config/database";

/** A space taking a connection's issues: those with the label, or for GitHub with no label, every issue in its repository. */
export interface TrackerIssueRule {
  id: string;
  projectId: string;
  integrationId: string;
  label: string | null;
  planNewIssues: boolean;
}

export type NewTrackerIssueRule = Omit<TrackerIssueRule, "id" | "projectId">;

export interface ConnectionSpaceRule extends TrackerIssueRule {
  projectName: string;
  projectSlug: string;
}

export class TrackerIssueRuleDAO {
  /** The rules of spaces that aren't archived. */
  async listForConnection(integrationId: string): Promise<ConnectionSpaceRule[]> {
    const rows = await db
      .selectFrom("tracker_issue_rules")
      .innerJoin("projects", "projects.id", "tracker_issue_rules.project_id")
      .selectAll("tracker_issue_rules")
      .select(["projects.name as project_name", "projects.slug as project_slug"])
      .where("tracker_issue_rules.integration_id", "=", integrationId)
      .where("projects.archived_at", "is", null)
      .orderBy("projects.name")
      .orderBy("tracker_issue_rules.label")
      .execute();
    return rows.map((row) => ({ ...toRule(row), projectName: row.project_name, projectSlug: row.project_slug }));
  }

  async listForSpace(projectId: string): Promise<TrackerIssueRule[]> {
    const rows = await db
      .selectFrom("tracker_issue_rules")
      .selectAll()
      .where("project_id", "=", projectId)
      .orderBy("label")
      .execute();
    return rows.map(toRule);
  }

  /** Sets a space's rules for one connection, replacing the ones it had. */
  async replaceForSpace(projectId: string, integrationId: string, rules: Array<Pick<TrackerIssueRule, "label" | "planNewIssues">>): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("tracker_issue_rules").where("project_id", "=", projectId).where("integration_id", "=", integrationId).execute();
      if (rules.length === 0) return;
      await trx
        .insertInto("tracker_issue_rules")
        .values(rules.map((rule) => ({ project_id: projectId, integration_id: integrationId, label: rule.label, plan_new_issues: rule.planNewIssues })))
        .execute();
    });
  }
}

function toRule(row: { id: string; project_id: string; integration_id: string; label: string | null; plan_new_issues: boolean }): TrackerIssueRule {
  return {
    id: row.id,
    projectId: row.project_id,
    integrationId: row.integration_id,
    label: row.label,
    planNewIssues: row.plan_new_issues,
  };
}
