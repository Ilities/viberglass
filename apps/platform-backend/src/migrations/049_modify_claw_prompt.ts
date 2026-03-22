import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

const CLAW_SCHEDULED_TASK_TEMPLATE = `You are an expert software engineer. Complete the scheduled task described below.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Implement the task with minimal, focused changes.

---

{{taskInstructions}}

---

Please proceed with the task.`;

const SYSTEM_DEFAULTS: Array<{ prompt_type: string; template: string }> = [
  {
    prompt_type: "claw_scheduled_task",
    template: CLAW_SCHEDULED_TASK_TEMPLATE,
  },
];

export async function up(db: Kysely<Database>): Promise<void> {
  for (const row of SYSTEM_DEFAULTS) {
    await db
      .updateTable("prompt_templates")
      .set({
        project_id: null,
        template: row.template,
      })
      .where("prompt_type", "=", row.prompt_type)
      .execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {}
