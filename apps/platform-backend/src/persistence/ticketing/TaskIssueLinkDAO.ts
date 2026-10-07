import db from "../config/database";

/** The tracker issue a task came from, and the connection that posts back to it. */
export interface TaskIssueLink {
  ticketId: string;
  provider: string;
  issueKey: string;
  issueUrl: string | null;
  integrationId: string | null;
  webhookConfigId: string | null;
  apiBaseUrl: string | null;
}

type NewLink = TaskIssueLink;

export class TaskIssueLinkDAO {
  async create(link: NewLink): Promise<void> {
    await db
      .insertInto("task_issue_links")
      .values({
        ticket_id: link.ticketId,
        provider: link.provider,
        issue_key: link.issueKey,
        issue_url: link.issueUrl,
        integration_id: link.integrationId,
        webhook_config_id: link.webhookConfigId,
        api_base_url: link.apiBaseUrl,
      })
      .execute();
  }

  async getByTicket(ticketId: string): Promise<TaskIssueLink | null> {
    const row = await db.selectFrom("task_issue_links").selectAll().where("ticket_id", "=", ticketId).executeTakeFirst();
    return row ? toLink(row) : null;
  }

  /** The task an issue is linked to in a space; the newest, should the issue have been linked twice. */
  async findTicket(provider: string, issueKey: string, projectId: string): Promise<string | null> {
    const row = await db
      .selectFrom("task_issue_links")
      .innerJoin("tickets", "tickets.id", "task_issue_links.ticket_id")
      .select("task_issue_links.ticket_id")
      .where("task_issue_links.provider", "=", provider)
      .where("task_issue_links.issue_key", "=", issueKey)
      .where("tickets.project_id", "=", projectId)
      .orderBy("task_issue_links.created_at", "desc")
      .executeTakeFirst();
    return row?.ticket_id ?? null;
  }
}

function toLink(row: {
  ticket_id: string;
  provider: string;
  issue_key: string;
  issue_url: string | null;
  integration_id: string | null;
  webhook_config_id: string | null;
  api_base_url: string | null;
}): TaskIssueLink {
  return {
    ticketId: row.ticket_id,
    provider: row.provider,
    issueKey: row.issue_key,
    issueUrl: row.issue_url,
    integrationId: row.integration_id,
    webhookConfigId: row.webhook_config_id,
    apiBaseUrl: row.api_base_url,
  };
}
