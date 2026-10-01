import db from "../config/database";

export type PromptType =
  | "task_turn"
  | "task_turn_cold_start"
  | "claw_scheduled_task";

export const PROMPT_TYPE: Record<PromptType, PromptType> = {
  task_turn: "task_turn",
  task_turn_cold_start: "task_turn_cold_start",
  claw_scheduled_task: "claw_scheduled_task",
};

export const ALL_PROMPT_TYPES: PromptType[] = [
  "task_turn",
  "task_turn_cold_start",
  "claw_scheduled_task",
];

const PROMPT_TYPE_META: Record<PromptType, { label: string; description: string }> = {
  task_turn: {
    label: "Task Turn",
    description: "What each agent turn on a task is told: what's new in the thread, and what was asked for",
  },
  task_turn_cold_start: {
    label: "Task Turn (first turn)",
    description: "Put before a turn when the agent starts without its earlier session: the task, its documents and the thread so far",
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
