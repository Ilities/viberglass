import { Kysely } from "kysely";

// Connections used to be named after their provider plus the time they were
// created. They take the provider's name instead, numbered when it's taken,
// the same way new connections are named.

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  jira: "Jira",
  linear: "Linear",
  shortcut: "Shortcut",
  monday: "Monday.com",
  slack: "Slack",
  custom: "Custom Webhook",
};

const CREATED_AT_SUFFIX = / \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export interface ConnectionName {
  id: string;
  name: string;
  system: string;
}

/** New names by connection id. Pass connections oldest first: the oldest gets the unnumbered name. */
export function renamesFor(connections: ConnectionName[]): Map<string, string> {
  const isTimestamped = (connection: ConnectionName): boolean => {
    const label = PROVIDER_LABELS[connection.system];
    return CREATED_AT_SUFFIX.test(connection.name) && connection.name.replace(CREATED_AT_SUFFIX, "") === label;
  };

  const taken = new Set(connections.filter((connection) => !isTimestamped(connection)).map((connection) => connection.name));
  const renames = new Map<string, string>();
  for (const connection of connections) {
    if (!isTimestamped(connection)) continue;
    const label = PROVIDER_LABELS[connection.system];
    let name = label;
    for (let number = 2; taken.has(name); number += 1) name = `${label} ${number}`;
    taken.add(name);
    renames.set(connection.id, name);
  }
  return renames;
}

export async function up(db: Kysely<any>): Promise<void> {
  const rows = await db.selectFrom("integrations").select(["id", "name", "system"]).orderBy("created_at").orderBy("id").execute();
  const connections = rows.map((row) => ({ id: String(row.id), name: String(row.name), system: String(row.system) }));

  for (const [id, name] of renamesFor(connections)) {
    await db.updateTable("integrations").set({ name }).where("id", "=", id).execute();
  }
}

// The creation times the old names carried are still in created_at.
export async function down(): Promise<void> {}
