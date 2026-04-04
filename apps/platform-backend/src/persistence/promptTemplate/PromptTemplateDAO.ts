import db from "../config/database";

export type PromptType =
  | "ticket_research"
  | "ticket_research_revision"
  | "ticket_research_revision_task"
  | "ticket_planning_with_research"
  | "ticket_planning_without_research"
  | "ticket_planning_revision"
  | "ticket_planning_revision_task"
  | "ticket_developing"
  | "claw_scheduled_task";

export const PROMPT_TYPE: Record<PromptType, PromptType> = {
  ticket_research: "ticket_research",
  ticket_research_revision: "ticket_research_revision",
  ticket_research_revision_task: "ticket_research_revision_task",
  ticket_planning_with_research: "ticket_planning_with_research",
  ticket_planning_without_research: "ticket_planning_without_research",
  ticket_planning_revision: "ticket_planning_revision",
  ticket_planning_revision_task: "ticket_planning_revision_task",
  ticket_developing: "ticket_developing",
  claw_scheduled_task: "claw_scheduled_task",
};

export const ALL_PROMPT_TYPES: PromptType[] = [
  "ticket_research",
  "ticket_research_revision",
  "ticket_research_revision_task",
  "ticket_planning_with_research",
  "ticket_planning_without_research",
  "ticket_planning_revision",
  "ticket_planning_revision_task",
  "ticket_developing",
  "claw_scheduled_task",
];

const PROMPT_TYPE_META: Record<PromptType, { label: string; description: string }> = {
  ticket_research: {
    label: "Research Task",
    description: "Prompt used when running ticket research",
  },
  ticket_research_revision: {
    label: "Research Revision",
    description: "Initial message for research revision sessions",
  },
  ticket_research_revision_task: {
    label: "Research Revision Task",
    description: "Task directive for research revision agent sessions",
  },
  ticket_planning_with_research: {
    label: "Planning (with Research)",
    description: "Planning prompt when a research document is available",
  },
  ticket_planning_without_research: {
    label: "Planning (without Research)",
    description: "Planning prompt when no research document exists",
  },
  ticket_planning_revision: {
    label: "Planning Revision",
    description: "Initial message for planning revision sessions",
  },
  ticket_planning_revision_task: {
    label: "Planning Revision Task",
    description: "Task directive for planning revision agent sessions",
  },
  ticket_developing: {
    label: "Development Task",
    description: "Prompt used for ticket execution / development",
  },
  claw_scheduled_task: {
    label: "Claw Scheduled Task",
    description: "Prompt for scheduled claw task execution",
  },
};

export interface PromptTemplateEntry {
  type: PromptType;
  label: string;
  description: string;
  systemDefault: string;
  projectOverride: string | null;
  effectiveTemplate: string;
  isDefault: boolean;
}

export class PromptTemplateDAO {
  async getEffectiveTemplate(
    type: PromptType,
    projectId: string,
  ): Promise<string> {
    const rows = await db
      .selectFrom("prompt_templates")
      .select(["template", "project_id"])
      .where("prompt_type", "=", type)
      .where((eb) =>
        eb.or([
          eb("project_id", "=", projectId),
          eb("project_id", "is", null),
        ]),
      )
      .orderBy(
        (eb) =>
          eb
            .case()
            .when("project_id", "=", projectId)
            .then(0)
            .else(1)
            .end(),
      )
      .limit(1)
      .execute();

    if (rows.length === 0) {
      throw new Error(`No prompt template found for type: ${type}`);
    }
    return rows[0].template;
  }

  async listForProject(projectId: string): Promise<PromptTemplateEntry[]> {
    const systemRows = await db
      .selectFrom("prompt_templates")
      .select(["prompt_type", "template"])
      .where("project_id", "is", null)
      .execute();

    const projectRows = await db
      .selectFrom("prompt_templates")
      .select(["prompt_type", "template"])
      .where("project_id", "=", projectId)
      .execute();

    const systemMap = new Map(systemRows.map((r) => [r.prompt_type, r.template]));
    const projectMap = new Map(projectRows.map((r) => [r.prompt_type, r.template]));

    return ALL_PROMPT_TYPES.map((type) => {
      const systemDefault = systemMap.get(type) ?? "";
      const projectOverride = projectMap.get(type) ?? null;
      const meta = PROMPT_TYPE_META[type];
      return {
        type,
        label: meta.label,
        description: meta.description,
        systemDefault,
        projectOverride,
        effectiveTemplate: projectOverride ?? systemDefault,
        isDefault: projectOverride === null,
      };
    });
  }

  async listSystemDefaults(): Promise<PromptTemplateEntry[]> {
    const systemRows = await db
      .selectFrom("prompt_templates")
      .select(["prompt_type", "template"])
      .where("project_id", "is", null)
      .execute();

    const systemMap = new Map(systemRows.map((r) => [r.prompt_type, r.template]));

    return ALL_PROMPT_TYPES.map((type) => {
      const systemDefault = systemMap.get(type) ?? "";
      const meta = PROMPT_TYPE_META[type];
      return {
        type,
        label: meta.label,
        description: meta.description,
        systemDefault,
        projectOverride: null,
        effectiveTemplate: systemDefault,
        isDefault: true,
      };
    });
  }

  async setSystemDefault(type: PromptType, template: string): Promise<void> {
    // System defaults are always seeded by migration; UPDATE is safe and avoids
    // partial-index conflict target syntax issues.
    await db
      .updateTable("prompt_templates")
      .set({ template })
      .where("prompt_type", "=", type)
      .where("project_id", "is", null)
      .execute();
  }

  async setProjectTemplate(
    projectId: string,
    type: PromptType,
    template: string,
  ): Promise<void> {
    await db
      .insertInto("prompt_templates")
      .values({ prompt_type: type, project_id: projectId, template })
      .onConflict((oc) =>
        oc
          .columns(["prompt_type", "project_id"])
          .where("project_id", "is not", null)
          .doUpdateSet({ template }),
      )
      .execute();
  }

  async deleteProjectTemplate(
    projectId: string,
    type: PromptType,
  ): Promise<void> {
    await db
      .deleteFrom("prompt_templates")
      .where("project_id", "=", projectId)
      .where("prompt_type", "=", type)
      .execute();
  }
}
